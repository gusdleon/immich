# Chunked Upload Implementation

This document describes the chunked upload functionality implemented for Immich to improve the upload experience for large files.

## Overview

Chunked upload allows large files to be uploaded in smaller pieces (chunks) rather than as a single large request. This provides several benefits:

- **Better progress tracking** for large files
- **Resume capability** for failed uploads  
- **Improved memory usage** (don't load entire file into memory)
- **More reliable uploads** over unstable connections
- **Better user experience** for large video files

## Architecture

### Server-side API

The server exposes new REST endpoints for chunked uploads:

- `POST /api/assets/upload/init` - Initialize chunked upload session
- `PUT /api/assets/upload/{uploadId}/chunk/{chunkIndex}` - Upload individual chunk
- `POST /api/assets/upload/{uploadId}/complete` - Complete chunked upload
- `GET /api/assets/upload/{uploadId}/status` - Get upload status
- `DELETE /api/assets/upload/{uploadId}` - Cancel upload

#### Session Management

- Upload sessions are stored in memory with automatic cleanup
- Sessions expire after 30 minutes of inactivity
- Temporary chunk files are stored in `/tmp/immich-chunks/{sessionId}/`
- File assembly uses streaming to minimize memory usage

### Web Client

The web client automatically detects when to use chunked uploads:

- **Files >10MB**: Use chunked upload
- **Files ≤10MB**: Use single upload (existing behavior)
- **Chunk sizes**: Dynamically calculated based on file size (1MB-20MB)
- **Progress tracking**: Shows per-chunk progress
- **Error handling**: Automatic cleanup on failure

### Mobile App

The mobile app provides configurable chunked upload support:

- **User setting**: Enable/disable chunked uploads
- **Threshold setting**: Configurable size threshold (default 50MB)
- **Background compatible**: Works with existing background upload system
- **WiFi/Cellular**: Respects existing network preferences

## Usage

### Web Client

No changes needed for users - chunked uploads are automatic for large files.

For developers:
```typescript
import { ChunkedUploader } from '$lib/utils/chunked-uploader';

// Upload a file with custom options
const result = await ChunkedUploader.uploadFile({
  file: largeFile,
  deviceAssetId: 'unique-id',
  deviceId: 'WEB',
  fileCreatedAt: new Date(),
  fileModifiedAt: new Date(),
  chunkSize: ChunkedUploader.getOptimalChunkSize(largeFile.size),
  onProgress: (loaded, total, chunkIndex) => {
    console.log(`Progress: ${(loaded/total*100).toFixed(1)}%`);
  },
  onChunkComplete: (chunkIndex, totalChunks) => {
    console.log(`Chunk ${chunkIndex+1}/${totalChunks} completed`);
  },
});
```

### Mobile App

Users can configure chunked uploads in settings:

1. Go to Settings > Backup Settings
2. Enable "Chunked Uploads" toggle
3. Set "Large File Threshold" (default 50MB)

For developers:
```dart
import 'package:immich_mobile/services/chunk_upload.service.dart';

// Upload a file with chunked upload
final result = await chunkUploadService.uploadFileChunked(
  file: file,
  deviceAssetId: assetId,
  deviceId: deviceId,
  fileCreatedAt: DateTime.now(),
  fileModifiedAt: DateTime.now(),
  onProgress: (sent, total) {
    print('Progress: ${(sent/total*100).toStringAsFixed(1)}%');
  },
  onChunkComplete: (chunkIndex, totalChunks) {
    print('Chunk ${chunkIndex+1}/$totalChunks completed');
  },
);
```

### Server API

Initialize upload session:
```bash
curl -X POST http://localhost:3001/api/assets/upload/init \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "filename": "large-video.mp4",
    "totalSize": 104857600,
    "totalChunks": 20,
    "deviceAssetId": "unique-device-asset-id",
    "deviceId": "WEB",
    "fileCreatedAt": "2024-01-01T00:00:00.000Z",
    "fileModifiedAt": "2024-01-01T00:00:00.000Z"
  }'
```

Upload chunk:
```bash
curl -X PUT http://localhost:3001/api/assets/upload/{uploadId}/chunk/0 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "chunk=@chunk_0.bin"
```

Complete upload:
```bash
curl -X POST http://localhost:3001/api/assets/upload/{uploadId}/complete \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"checksum": "optional-sha1-checksum"}'
```

## Configuration

### Web Client

Configuration is automatic based on file size:

- **Chunk threshold**: 10MB (hardcoded)
- **Chunk sizes**: 1MB-20MB (dynamic based on file size)
- **Fallback**: Automatic fallback to single upload for smaller files

### Mobile App

Configurable via app settings:

```dart
// Enable/disable chunked uploads
AppSettingsEnum.enableChunkedUploads

// Set threshold in MB (default 50MB)
AppSettingsEnum.chunkedUploadThreshold
```

### Server

Configuration through environment or startup:

- **Temp directory**: `/tmp/immich-chunks` (configurable)
- **Session timeout**: 30 minutes (configurable)
- **Cleanup interval**: 1 minute (configurable)

## Performance Considerations

### Memory Usage

- **Server**: Streams chunks to disk, minimal memory usage
- **Web**: Processes one chunk at a time
- **Mobile**: Uses streaming for large files

### Storage

- **Temporary storage**: Chunks stored temporarily during upload
- **Cleanup**: Automatic cleanup of temporary files
- **Disk space**: Ensure adequate space for temporary chunks

### Network

- **Parallel uploads**: Currently sequential (could be optimized)
- **Retry logic**: Per-chunk retry capability
- **Progress tracking**: Fine-grained progress reporting

## Error Handling

### Upload Failures

- **Chunk retry**: Individual chunks can be retried
- **Session recovery**: Sessions can be resumed (future enhancement)
- **Automatic cleanup**: Failed uploads are automatically cleaned up

### Common Errors

1. **Session not found**: Upload session expired or invalid
2. **Chunk out of order**: Chunks must be uploaded in sequence
3. **File assembly failed**: Error combining chunks
4. **Disk space**: Insufficient temporary storage

### Troubleshooting

1. **Check server logs** for detailed error information
2. **Verify disk space** in temporary directory
3. **Check session timeout** settings
4. **Ensure proper authentication** for all requests

## Future Enhancements

- **Parallel chunk uploads**: Upload multiple chunks simultaneously
- **Resume capability**: Resume interrupted uploads
- **Background sync**: Better mobile background upload integration
- **Compression**: Optional chunk compression
- **Encryption**: Optional chunk encryption
- **Progress persistence**: Persist progress across app restarts

## Testing

### Unit Tests

```bash
# Web client tests
cd web && npm run test -- src/lib/utils/chunked-uploader.spec.ts

# Server tests (when implemented)
cd server && npm run test -- src/services/asset-chunk-upload.service.spec.ts
```

### Integration Tests

```bash
# Run integration tests (requires running server)
cd test && npm run test -- integration/chunked-upload.integration.spec.ts
```

### Manual Testing

1. **Create test files** of various sizes (1MB, 10MB, 50MB, 100MB)
2. **Upload via web client** and verify chunking behavior
3. **Monitor server logs** for chunk processing
4. **Test error scenarios** (network interruption, server restart)
5. **Verify final assets** are identical to originals

## Monitoring

### Metrics to Track

- **Upload success rate** (chunked vs single)
- **Average upload time** by file size
- **Chunk retry rate**
- **Session timeout rate**
- **Temporary storage usage**

### Log Messages

Server logs include:
- Session initialization and completion
- Chunk upload progress
- Error conditions and cleanup
- Performance metrics

### Health Checks

- Monitor temporary directory disk usage
- Track active upload sessions
- Monitor chunk assembly performance
- Check session cleanup effectiveness