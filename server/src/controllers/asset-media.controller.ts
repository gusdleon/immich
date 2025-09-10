import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Next,
  Param,
  ParseFilePipe,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NextFunction, Request, Response } from 'express';
import { EndpointLifecycle } from 'src/decorators';
import {
  AssetBulkUploadCheckResponseDto,
  AssetMediaResponseDto,
  AssetMediaStatus,
  CheckExistingAssetsResponseDto,
} from 'src/dtos/asset-media-response.dto';
import {
  AssetBulkUploadCheckDto,
  AssetMediaCreateDto,
  AssetMediaOptionsDto,
  AssetMediaReplaceDto,
  AssetMediaSize,
  CheckExistingAssetsDto,
  UploadFieldName,
} from 'src/dtos/asset-media.dto';
import {
  ChunkUploadCompleteDto,
  ChunkUploadInitDto,
  ChunkUploadInitResponseDto,
  ChunkUploadResponseDto,
} from 'src/dtos/asset-chunk-upload.dto';
import { AuthDto } from 'src/dtos/auth.dto';
import { ImmichHeader, Permission, RouteKey } from 'src/enum';
import { AssetUploadInterceptor } from 'src/middleware/asset-upload.interceptor';
import { Auth, Authenticated, FileResponse } from 'src/middleware/auth.guard';
import { FileUploadInterceptor, getFiles } from 'src/middleware/file-upload.interceptor';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { AssetMediaService } from 'src/services/asset-media.service';
import { AssetChunkUploadService } from 'src/services/asset-chunk-upload.service';
import { UploadFiles } from 'src/types';
import { ImmichFileResponse, sendFile } from 'src/utils/file';
import { FileNotEmptyValidator, UUIDParamDto } from 'src/validation';

@ApiTags('Assets')
@Controller(RouteKey.Asset)
export class AssetMediaController {
  constructor(
    private logger: LoggingRepository,
    private service: AssetMediaService,
    private chunkUploadService: AssetChunkUploadService,
  ) {}

  @Post()
  @UseInterceptors(AssetUploadInterceptor, FileUploadInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiHeader({
    name: ImmichHeader.Checksum,
    description: 'sha1 checksum that can be used for duplicate detection before the file is uploaded',
    required: false,
  })
  @ApiBody({ description: 'Asset Upload Information', type: AssetMediaCreateDto })
  @Authenticated({ permission: Permission.AssetUpload, sharedLink: true })
  async uploadAsset(
    @Auth() auth: AuthDto,
    @UploadedFiles(new ParseFilePipe({ validators: [new FileNotEmptyValidator(['assetData'])] })) files: UploadFiles,
    @Body() dto: AssetMediaCreateDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AssetMediaResponseDto> {
    const { file, sidecarFile } = getFiles(files);
    const responseDto = await this.service.uploadAsset(auth, dto, file, sidecarFile);

    if (responseDto.status === AssetMediaStatus.DUPLICATE) {
      res.status(HttpStatus.OK);
    }

    return responseDto;
  }

  @Get(':id/original')
  @FileResponse()
  @Authenticated({ permission: Permission.AssetDownload, sharedLink: true })
  async downloadAsset(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    await sendFile(res, next, () => this.service.downloadOriginal(auth, id), this.logger);
  }

  /**
   *  Replace the asset with new file, without changing its id
   */
  @Put(':id/original')
  @UseInterceptors(FileUploadInterceptor)
  @ApiConsumes('multipart/form-data')
  @EndpointLifecycle({ addedAt: 'v1.106.0' })
  @ApiOperation({
    summary: 'replaceAsset',
    description: 'Replace the asset with new file, without changing its id',
  })
  @Authenticated({ permission: Permission.AssetReplace, sharedLink: true })
  async replaceAsset(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @UploadedFiles(new ParseFilePipe({ validators: [new FileNotEmptyValidator([UploadFieldName.ASSET_DATA])] }))
    files: UploadFiles,
    @Body() dto: AssetMediaReplaceDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AssetMediaResponseDto> {
    const { file } = getFiles(files);
    const responseDto = await this.service.replaceAsset(auth, id, dto, file);
    if (responseDto.status === AssetMediaStatus.DUPLICATE) {
      res.status(HttpStatus.OK);
    }
    return responseDto;
  }

  @Get(':id/thumbnail')
  @FileResponse()
  @Authenticated({ permission: Permission.AssetView, sharedLink: true })
  async viewAsset(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Query() dto: AssetMediaOptionsDto,
    @Req() req: Request,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    const viewThumbnailRes = await this.service.viewThumbnail(auth, id, dto);

    if (viewThumbnailRes instanceof ImmichFileResponse) {
      await sendFile(res, next, () => Promise.resolve(viewThumbnailRes), this.logger);
    } else {
      // viewThumbnailRes is a AssetMediaRedirectResponse
      // which redirects to the original asset or a specific size to make better use of caching
      const { targetSize } = viewThumbnailRes;
      const [reqPath, reqSearch] = req.url.split('?');
      let redirPath: string;
      const redirSearchParams = new URLSearchParams(reqSearch);
      if (targetSize === 'original') {
        // relative path to this.downloadAsset
        redirPath = 'original';
        redirSearchParams.delete('size');
      } else if (Object.values(AssetMediaSize).includes(targetSize)) {
        redirPath = reqPath;
        redirSearchParams.set('size', targetSize);
      } else {
        throw new Error('Invalid targetSize: ' + targetSize);
      }
      const finalRedirPath = redirPath + '?' + redirSearchParams.toString();
      return res.redirect(finalRedirPath);
    }
  }

  @Get(':id/video/playback')
  @FileResponse()
  @Authenticated({ permission: Permission.AssetView, sharedLink: true })
  async playAssetVideo(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    await sendFile(res, next, () => this.service.playbackVideo(auth, id), this.logger);
  }

  /**
   * Checks if multiple assets exist on the server and returns all existing - used by background backup
   */
  @Post('exist')
  @Authenticated()
  @ApiOperation({
    summary: 'checkExistingAssets',
    description: 'Checks if multiple assets exist on the server and returns all existing - used by background backup',
  })
  @HttpCode(HttpStatus.OK)
  checkExistingAssets(
    @Auth() auth: AuthDto,
    @Body() dto: CheckExistingAssetsDto,
  ): Promise<CheckExistingAssetsResponseDto> {
    return this.service.checkExistingAssets(auth, dto);
  }

  /**
   * Checks if assets exist by checksums
   */
  @Post('bulk-upload-check')
  @Authenticated({ permission: Permission.AssetUpload })
  @ApiOperation({
    summary: 'checkBulkUpload',
    description: 'Checks if assets exist by checksums',
  })
  @HttpCode(HttpStatus.OK)
  checkBulkUpload(
    @Auth() auth: AuthDto,
    @Body() dto: AssetBulkUploadCheckDto,
  ): Promise<AssetBulkUploadCheckResponseDto> {
    return this.service.bulkUploadCheck(auth, dto);
  }

  /**
   * Initialize chunked upload session
   */
  @Post('upload/init')
  @Authenticated({ permission: Permission.AssetUpload })
  @ApiOperation({
    summary: 'initializeChunkUpload',
    description: 'Initialize a chunked upload session for large files',
  })
  @HttpCode(HttpStatus.OK)
  initializeChunkUpload(
    @Auth() auth: AuthDto,
    @Body() dto: ChunkUploadInitDto,
  ): Promise<ChunkUploadInitResponseDto> {
    return this.chunkUploadService.initializeChunkUpload(auth, dto);
  }

  /**
   * Upload a chunk for an ongoing upload session
   */
  @Put('upload/:uploadId/chunk/:chunkIndex')
  @UseInterceptors(FileUploadInterceptor)
  @ApiConsumes('multipart/form-data')
  @Authenticated({ permission: Permission.AssetUpload })
  @ApiOperation({
    summary: 'uploadChunk',
    description: 'Upload a chunk for an ongoing upload session',
  })
  async uploadChunk(
    @Auth() auth: AuthDto,
    @Param('uploadId') uploadId: string,
    @Param('chunkIndex') chunkIndex: string,
    @UploadedFile(new ParseFilePipe({ validators: [new FileNotEmptyValidator(['chunk'])] })) 
    chunkFile: Express.Multer.File,
  ): Promise<ChunkUploadResponseDto> {
    const chunkIndexNum = parseInt(chunkIndex, 10);
    if (isNaN(chunkIndexNum) || chunkIndexNum < 0) {
      throw new BadRequestException('Invalid chunk index');
    }

    // Convert Express.Multer.File to UploadFile
    const uploadFile = {
      uuid: '',
      checksum: Buffer.alloc(0),
      originalPath: chunkFile.path,
      originalName: chunkFile.originalname,
      size: chunkFile.size,
    };

    return this.chunkUploadService.uploadChunk(auth, uploadId, chunkIndexNum, uploadFile);
  }

  /**
   * Complete chunked upload and create asset
   */
  @Post('upload/:uploadId/complete')
  @Authenticated({ permission: Permission.AssetUpload })
  @ApiOperation({
    summary: 'completeChunkUpload',
    description: 'Complete chunked upload and create the asset',
  })
  completeChunkUpload(
    @Auth() auth: AuthDto,
    @Param('uploadId') uploadId: string,
    @Body() dto: ChunkUploadCompleteDto,
  ): Promise<AssetMediaResponseDto> {
    return this.chunkUploadService.completeChunkUpload(auth, uploadId, dto);
  }

  /**
   * Get upload session status
   */
  @Get('upload/:uploadId/status')
  @Authenticated({ permission: Permission.AssetUpload })
  @ApiOperation({
    summary: 'getUploadStatus',
    description: 'Get the status of an ongoing upload session',
  })
  getUploadStatus(
    @Auth() auth: AuthDto,
    @Param('uploadId') uploadId: string,
  ): ChunkUploadResponseDto {
    return this.chunkUploadService.getUploadStatus(auth, uploadId);
  }

  /**
   * Cancel upload session
   */
  @Delete('upload/:uploadId')
  @Authenticated({ permission: Permission.AssetUpload })
  @ApiOperation({
    summary: 'cancelUpload',
    description: 'Cancel an ongoing upload session',
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  cancelUpload(@Auth() auth: AuthDto, @Param('uploadId') uploadId: string): void {
    return this.chunkUploadService.cancelUpload(auth, uploadId);
  }
}
