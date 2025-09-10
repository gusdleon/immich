import { uploadRequest } from '$lib/utils';
import { getBaseUrl } from '@immich/sdk';
import { authManager } from '$lib/managers/auth-manager.svelte';
import { asQueryString } from '$lib/utils/shared-links';

interface ChunkUploadSession {
  uploadId: string;
  chunkSize: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  assetId?: string;
}

interface ChunkUploadOptions {
  file: File;
  deviceAssetId: string;
  deviceId: string;
  fileCreatedAt: Date;
  fileModifiedAt: Date;
  duration?: string;
  visibility?: string;
  livePhotoVideoId?: string;
  checksum?: string;
  isFavorite?: boolean;
  chunkSize?: number;
  onProgress?: (loaded: number, total: number, chunkIndex: number) => void;
  onChunkComplete?: (chunkIndex: number, totalChunks: number) => void;
}

interface ChunkUploadResult {
  id: string;
  status: string;
  isTrashed?: boolean;
}

export class ChunkedUploader {
  private static readonly DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
  private static readonly MIN_CHUNK_SIZE = 100 * 1024; // 100KB for chunking

  static async uploadFile(options: ChunkUploadOptions): Promise<ChunkUploadResult> {
    const { file, onProgress, onChunkComplete } = options;
    const chunkSize = options.chunkSize || this.DEFAULT_CHUNK_SIZE;

    // Use single upload for small files
    if (file.size <= this.MIN_CHUNK_SIZE) {
      return this.uploadSingleFile(options);
    }

    const totalChunks = Math.ceil(file.size / chunkSize);
    
    // Initialize chunked upload session
    const session = await this.initializeUpload({
      filename: file.name,
      totalSize: file.size,
      totalChunks,
      deviceAssetId: options.deviceAssetId,
      deviceId: options.deviceId,
      fileCreatedAt: options.fileCreatedAt,
      fileModifiedAt: options.fileModifiedAt,
      duration: options.duration,
      visibility: options.visibility,
      livePhotoVideoId: options.livePhotoVideoId,
      checksum: options.checksum,
      isFavorite: options.isFavorite,
    });

    // If asset already exists (duplicate), return early
    if (session.status === 'completed' && session.assetId) {
      return {
        id: session.assetId,
        status: 'duplicate',
      };
    }

    // Upload chunks
    let uploadedBytes = 0;
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const start = chunkIndex * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunk = file.slice(start, end);

      await this.uploadChunk(session.uploadId, chunkIndex, chunk, (loaded, total) => {
        const totalLoaded = uploadedBytes + loaded;
        onProgress?.(totalLoaded, file.size, chunkIndex);
      });

      uploadedBytes += chunk.size;
      onChunkComplete?.(chunkIndex, totalChunks);
    }

    // Complete the upload
    return this.completeUpload(session.uploadId, options.checksum);
  }

  private static async uploadSingleFile(options: ChunkUploadOptions): Promise<ChunkUploadResult> {
    // Use the existing single file upload logic
    const formData = new FormData();
    formData.append('deviceAssetId', options.deviceAssetId);
    formData.append('deviceId', options.deviceId);
    formData.append('fileCreatedAt', options.fileCreatedAt.toISOString());
    formData.append('fileModifiedAt', options.fileModifiedAt.toISOString());
    formData.append('isFavorite', options.isFavorite ? 'true' : 'false');
    formData.append('duration', options.duration || '0:00:00.000000');
    formData.append('assetData', options.file);

    if (options.visibility) {
      formData.append('visibility', options.visibility);
    }

    if (options.livePhotoVideoId) {
      formData.append('livePhotoVideoId', options.livePhotoVideoId);
    }

    const queryParams = asQueryString(authManager.params);
    const response = await uploadRequest<ChunkUploadResult>({
      url: getBaseUrl() + '/assets' + (queryParams ? `?${queryParams}` : ''),
      data: formData,
      onUploadProgress: (event) => options.onProgress?.(event.loaded, event.total || event.loaded, 0),
    });

    return response.data;
  }

  private static async initializeUpload(data: {
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
    checksum?: string;
    isFavorite?: boolean;
  }): Promise<ChunkUploadSession> {
    const body = {
      ...data,
      fileCreatedAt: data.fileCreatedAt.toISOString(),
      fileModifiedAt: data.fileModifiedAt.toISOString(),
    };

    const queryParams = asQueryString(authManager.params);
    const response = await fetch(
      getBaseUrl() + '/assets/upload/init' + (queryParams ? `?${queryParams}` : ''),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to initialize upload: ${response.statusText}`);
    }

    return response.json();
  }

  private static async uploadChunk(
    uploadId: string,
    chunkIndex: number,
    chunk: Blob,
    onProgress?: (loaded: number, total: number) => void
  ): Promise<void> {
    const formData = new FormData();
    formData.append('chunk', chunk);

    const queryParams = asQueryString(authManager.params);
    const url = getBaseUrl() + 
      `/assets/upload/${uploadId}/chunk/${chunkIndex}` + 
      (queryParams ? `?${queryParams}` : '');

    await uploadRequest({
      url,
      method: 'PUT',
      data: formData,
      onUploadProgress: (event) => onProgress?.(event.loaded, event.total || event.loaded),
    });
  }

  private static async completeUpload(uploadId: string, checksum?: string): Promise<ChunkUploadResult> {
    const body = checksum ? { checksum } : {};
    
    const queryParams = asQueryString(authManager.params);
    const response = await fetch(
      getBaseUrl() + `/assets/upload/${uploadId}/complete` + (queryParams ? `?${queryParams}` : ''),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to complete upload: ${response.statusText}`);
    }

    return response.json();
  }

  static async cancelUpload(uploadId: string): Promise<void> {
    const queryParams = asQueryString(authManager.params);
    const response = await fetch(
      getBaseUrl() + `/assets/upload/${uploadId}` + (queryParams ? `?${queryParams}` : ''),
      {
        method: 'DELETE',
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to cancel upload: ${response.statusText}`);
    }
  }

  static isChunkedUploadSupported(): boolean {
    // Check if the server supports chunked uploads
    // This could be extended to check server capabilities
    return true;
  }

  static getOptimalChunkSize(fileSize: number, preferredChunkSize: number = 100 * 1024 * 1024): number {
    // Use the preferred chunk size as the maximum
    // For very large files, we might still want smaller chunks for better upload parallelism
    if (fileSize < preferredChunkSize) {
      // For files smaller than preferred chunk size, use a smaller chunk for better progress
      return Math.min(5 * 1024 * 1024, preferredChunkSize); // 5MB max for small files
    }
    
    // For large files, use the configured chunk size but cap it reasonably
    return Math.min(preferredChunkSize, 200 * 1024 * 1024); // Never exceed 200MB
  }
}