import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import { AssetMediaService } from 'src/services/asset-media.service';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { StorageCore } from 'src/cores/storage.core';
import { StorageFolder } from 'src/enum';
import { AuthDto } from 'src/dtos/auth.dto';
import {
  ChunkUploadCompleteDto,
  ChunkUploadInitDto,
  ChunkUploadInitResponseDto,
  ChunkUploadResponseDto,
} from 'src/dtos/asset-chunk-upload.dto';
import { UploadFile } from 'src/types';
import { AssetMediaResponseDto, AssetMediaStatus } from 'src/dtos/asset-media-response.dto';
import { AssetMediaCreateDto, UploadFieldName } from 'src/dtos/asset-media.dto';

interface ChunkUploadSession {
  id: string;
  userId: string;
  filename: string;
  totalSize: number;
  totalChunks: number;
  deviceAssetId: string;
  deviceId: string;
  fileCreatedAt: Date;
  fileModifiedAt: Date;
  duration?: string;
  visibility?: string;
  livePhotoVideoId?: string;
  expectedChecksum?: string;
  isFavorite?: boolean;
  receivedChunks: Set<number>;
  tempDir: string;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  createdAt: Date;
  lastActivity: Date;
}

@Injectable()
export class AssetChunkUploadService {
  private readonly sessions = new Map<string, ChunkUploadSession>();
  private readonly CHUNK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  private readonly SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

  constructor(
    private readonly assetMediaService: AssetMediaService,
    private readonly logger: LoggingRepository,
  ) {
    this.logger.setContext(AssetChunkUploadService.name);
    this.startCleanupTask();
  }

  private getChunksDir(userId: string): string {
    const userUploadDir = StorageCore.getFolderLocation(StorageFolder.Upload, userId);
    return join(userUploadDir, 'chunks');
  }

  private ensureTempDir(tempDir: string) {
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }
  }

  private startCleanupTask() {
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60 * 1000); // Run every minute
  }

  private cleanupExpiredSessions() {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastActivity.getTime() > this.SESSION_TIMEOUT_MS) {
        this.logger.warn(`Cleaning up expired upload session: ${sessionId}`);
        this.cleanupSession(sessionId);
      }
    }
  }

  private cleanupSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (session) {
      try {
        if (existsSync(session.tempDir)) {
          rmSync(session.tempDir, { recursive: true, force: true });
        }
      } catch (error) {
        this.logger.error(`Failed to cleanup session directory: ${error}`);
      }
      this.sessions.delete(sessionId);
    }
  }

  async initializeChunkUpload(auth: AuthDto, dto: ChunkUploadInitDto): Promise<ChunkUploadInitResponseDto> {
    // Check if asset already exists by checksum
    if (dto.checksum) {
      const existingAsset = await this.assetMediaService.getUploadAssetIdByChecksum(auth, dto.checksum);
      if (existingAsset) {
        return {
          uploadId: '',
          chunkSize: 0,
          status: 'completed',
          assetId: existingAsset.id,
        };
      }
    }

    const sessionId = randomUUID();
    const chunksBaseDir = this.getChunksDir(auth.user.id);
    const tempDir = join(chunksBaseDir, sessionId);

    this.ensureTempDir(tempDir);

    const session: ChunkUploadSession = {
      id: sessionId,
      userId: auth.user.id,
      filename: dto.filename,
      totalSize: dto.totalSize,
      totalChunks: dto.totalChunks,
      deviceAssetId: dto.deviceAssetId,
      deviceId: dto.deviceId,
      fileCreatedAt: dto.fileCreatedAt,
      fileModifiedAt: dto.fileModifiedAt,
      duration: dto.duration,
      visibility: dto.visibility,
      livePhotoVideoId: dto.livePhotoVideoId,
      expectedChecksum: dto.checksum,
      isFavorite: dto.isFavorite,
      receivedChunks: new Set(),
      tempDir,
      status: 'pending',
      createdAt: new Date(),
      lastActivity: new Date(),
    };

    this.sessions.set(sessionId, session);

    this.logger.log(`Initialized chunked upload session: ${sessionId} for user: ${auth.user.id}`);

    return {
      uploadId: sessionId,
      chunkSize: Math.ceil(dto.totalSize / dto.totalChunks),
      status: 'pending',
    };
  }

  async uploadChunk(
    auth: AuthDto,
    uploadId: string,
    chunkIndex: number,
    chunkFile: UploadFile,
  ): Promise<ChunkUploadResponseDto> {
    const session = this.sessions.get(uploadId);
    if (!session) {
      throw new NotFoundException('Upload session not found');
    }

    if (session.userId !== auth.user.id) {
      throw new BadRequestException('Upload session does not belong to user');
    }

    if (chunkIndex < 0 || chunkIndex >= session.totalChunks) {
      throw new BadRequestException('Invalid chunk index');
    }

    if (session.receivedChunks.has(chunkIndex)) {
      // Chunk already received, return success
      return {
        uploadId,
        chunkIndex,
        status: 'completed',
      };
    }

    session.lastActivity = new Date();
    session.status = 'uploading';

    const chunkPath = join(session.tempDir, `chunk_${chunkIndex}`);

    try {
      // Save chunk to temporary file
      await pipeline(createReadStream(chunkFile.originalPath), createWriteStream(chunkPath));

      session.receivedChunks.add(chunkIndex);

      this.logger.debug(`Received chunk ${chunkIndex}/${session.totalChunks - 1} for session: ${uploadId}`);

      return {
        uploadId,
        chunkIndex,
        status: 'completed',
      };
    } catch (error) {
      this.logger.error(`Failed to save chunk ${chunkIndex} for session ${uploadId}:`, error);
      session.status = 'error';
      throw new BadRequestException('Failed to save chunk');
    }
  }

  async completeChunkUpload(
    auth: AuthDto,
    uploadId: string,
    dto: ChunkUploadCompleteDto,
  ): Promise<AssetMediaResponseDto> {
    const session = this.sessions.get(uploadId);
    if (!session) {
      throw new NotFoundException('Upload session not found');
    }

    if (session.userId !== auth.user.id) {
      throw new BadRequestException('Upload session does not belong to user');
    }

    // Check if all chunks have been received
    for (let i = 0; i < session.totalChunks; i++) {
      if (!session.receivedChunks.has(i)) {
        throw new BadRequestException(`Missing chunk ${i}`);
      }
    }

    try {
      // Combine chunks into final file
      const finalPath = join(session.tempDir, session.filename);
      const writeStream = createWriteStream(finalPath);
      const hash = createHash('sha1');

      for (let i = 0; i < session.totalChunks; i++) {
        const chunkPath = join(session.tempDir, `chunk_${i}`);
        const chunkStream = createReadStream(chunkPath);
        
        await new Promise<void>((resolve, reject) => {
          chunkStream.on('data', (chunk) => {
            hash.update(chunk);
            writeStream.write(chunk);
          });
          chunkStream.on('end', resolve);
          chunkStream.on('error', reject);
        });
      }

      writeStream.end();

      // Verify checksum if provided
      const actualChecksum = hash.digest('hex');
      if (session.expectedChecksum && session.expectedChecksum !== actualChecksum) {
        throw new BadRequestException('Checksum mismatch');
      }

      // Create UploadFile for the combined file
      const uploadFile: UploadFile = {
        uuid: randomUUID(),
        checksum: Buffer.from(actualChecksum, 'hex'),
        originalPath: finalPath,
        originalName: session.filename,
        size: session.totalSize,
      };

      // Use existing asset media service to process the upload
      const createDto: AssetMediaCreateDto = {
        deviceAssetId: session.deviceAssetId,
        deviceId: session.deviceId,
        fileCreatedAt: session.fileCreatedAt,
        fileModifiedAt: session.fileModifiedAt,
        duration: session.duration || '0:00:00.000000',
        filename: session.filename,
        visibility: session.visibility as any,
        livePhotoVideoId: session.livePhotoVideoId,
        isFavorite: session.isFavorite,
        metadata: [],
        [UploadFieldName.ASSET_DATA]: null as any,
      };

      const result = await this.assetMediaService.uploadAsset(auth, createDto, uploadFile, undefined);

      session.status = 'completed';

      // Clean up session after successful upload
      setTimeout(() => this.cleanupSession(uploadId), 5000);

      this.logger.log(`Completed chunked upload for session: ${uploadId}, asset: ${result.id}`);

      return result;
    } catch (error) {
      this.logger.error(`Failed to complete chunked upload for session ${uploadId}:`, error);
      session.status = 'error';
      throw new BadRequestException('Failed to complete upload');
    }
  }

  getUploadStatus(auth: AuthDto, uploadId: string): ChunkUploadResponseDto {
    const session = this.sessions.get(uploadId);
    if (!session) {
      throw new NotFoundException('Upload session not found');
    }

    if (session.userId !== auth.user.id) {
      throw new BadRequestException('Upload session does not belong to user');
    }

    return {
      uploadId,
      chunkIndex: session.receivedChunks.size - 1,
      status: session.status,
    };
  }

  cancelUpload(auth: AuthDto, uploadId: string): void {
    const session = this.sessions.get(uploadId);
    if (!session) {
      throw new NotFoundException('Upload session not found');
    }

    if (session.userId !== auth.user.id) {
      throw new BadRequestException('Upload session does not belong to user');
    }

    this.cleanupSession(uploadId);
    this.logger.log(`Cancelled chunked upload session: ${uploadId}`);
  }
}