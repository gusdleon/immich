import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChunkedUploader } from './chunked-uploader';

// Mock dependencies
vi.mock('$lib/utils', () => ({
  uploadRequest: vi.fn(),
}));

vi.mock('@immich/sdk', () => ({
  getBaseUrl: vi.fn(() => 'http://localhost:3001'),
}));

vi.mock('$lib/managers/auth-manager.svelte', () => ({
  authManager: {
    params: {},
  },
}));

vi.mock('$lib/utils/shared-links', () => ({
  asQueryString: vi.fn(() => ''),
}));

describe('ChunkedUploader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isChunkedUploadSupported', () => {
    it('should return true', () => {
      expect(ChunkedUploader.isChunkedUploadSupported()).toBe(true);
    });
  });

  describe('getOptimalChunkSize', () => {
    it('should return 1MB for files under 10MB', () => {
      const fileSize = 5 * 1024 * 1024; // 5MB
      expect(ChunkedUploader.getOptimalChunkSize(fileSize)).toBe(1 * 1024 * 1024);
    });

    it('should return 5MB for files under 100MB', () => {
      const fileSize = 50 * 1024 * 1024; // 50MB
      expect(ChunkedUploader.getOptimalChunkSize(fileSize)).toBe(5 * 1024 * 1024);
    });

    it('should return 10MB for files under 1GB', () => {
      const fileSize = 500 * 1024 * 1024; // 500MB
      expect(ChunkedUploader.getOptimalChunkSize(fileSize)).toBe(10 * 1024 * 1024);
    });

    it('should return 20MB for larger files', () => {
      const fileSize = 2 * 1024 * 1024 * 1024; // 2GB
      expect(ChunkedUploader.getOptimalChunkSize(fileSize)).toBe(20 * 1024 * 1024);
    });
  });

  describe('uploadFile', () => {
    it('should use single upload for small files', async () => {
      // Mock a small file (50KB)
      const smallFile = new File(['x'.repeat(50 * 1024)], 'small.jpg', { type: 'image/jpeg' });
      
      const options = {
        file: smallFile,
        deviceAssetId: 'test-device-asset-id',
        deviceId: 'WEB',
        fileCreatedAt: new Date(),
        fileModifiedAt: new Date(),
      };

      // Mock the uploadRequest for single file upload
      const { uploadRequest } = await import('$lib/utils');
      vi.mocked(uploadRequest).mockResolvedValue({
        data: { id: 'asset-id', status: 'created' },
        status: 201,
      });

      const result = await ChunkedUploader.uploadFile(options);

      expect(result.id).toBe('asset-id');
      expect(uploadRequest).toHaveBeenCalledOnce();
    });
  });
});