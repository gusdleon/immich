import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/store.model.dart';
import 'package:immich_mobile/entities/store.entity.dart';
import 'package:immich_mobile/services/api.service.dart';
import 'package:immich_mobile/services/app_settings.service.dart';
import 'package:http/http.dart' as http;

final chunkUploadServiceProvider = Provider((ref) {
  return ChunkUploadService(
    ref.watch(appSettingsServiceProvider),
  );
});

class ChunkUploadInitDto {
  final String filename;
  final int totalSize;
  final int totalChunks;
  final String deviceAssetId;
  final String deviceId;
  final DateTime fileCreatedAt;
  final DateTime fileModifiedAt;
  final String? duration;
  final String? visibility;
  final String? livePhotoVideoId;
  final String? checksum;

  ChunkUploadInitDto({
    required this.filename,
    required this.totalSize,
    required this.totalChunks,
    required this.deviceAssetId,
    required this.deviceId,
    required this.fileCreatedAt,
    required this.fileModifiedAt,
    this.duration,
    this.visibility,
    this.livePhotoVideoId,
    this.checksum,
  });

  Map<String, dynamic> toJson() {
    return {
      'filename': filename,
      'totalSize': totalSize,
      'totalChunks': totalChunks,
      'deviceAssetId': deviceAssetId,
      'deviceId': deviceId,
      'fileCreatedAt': fileCreatedAt.toUtc().toIso8601String(),
      'fileModifiedAt': fileModifiedAt.toUtc().toIso8601String(),
      if (duration != null) 'duration': duration,
      if (visibility != null) 'visibility': visibility,
      if (livePhotoVideoId != null) 'livePhotoVideoId': livePhotoVideoId,
      if (checksum != null) 'checksum': checksum,
    };
  }
}

class ChunkUploadInitResponse {
  final String uploadId;
  final int chunkSize;
  final String status;
  final String? assetId;

  ChunkUploadInitResponse({
    required this.uploadId,
    required this.chunkSize,
    required this.status,
    this.assetId,
  });

  factory ChunkUploadInitResponse.fromJson(Map<String, dynamic> json) {
    return ChunkUploadInitResponse(
      uploadId: json['uploadId'] as String,
      chunkSize: json['chunkSize'] as int,
      status: json['status'] as String,
      assetId: json['assetId'] as String?,
    );
  }
}

class ChunkUploadResponse {
  final String uploadId;
  final int chunkIndex;
  final String status;

  ChunkUploadResponse({
    required this.uploadId,
    required this.chunkIndex,
    required this.status,
  });

  factory ChunkUploadResponse.fromJson(Map<String, dynamic> json) {
    return ChunkUploadResponse(
      uploadId: json['uploadId'] as String,
      chunkIndex: json['chunkIndex'] as int,
      status: json['status'] as String,
    );
  }
}

class ChunkUploadCompleteResponse {
  final String id;
  final String status;
  final bool? isTrashed;

  ChunkUploadCompleteResponse({
    required this.id,
    required this.status,
    this.isTrashed,
  });

  factory ChunkUploadCompleteResponse.fromJson(Map<String, dynamic> json) {
    return ChunkUploadCompleteResponse(
      id: json['id'] as String,
      status: json['status'] as String,
      isTrashed: json['isTrashed'] as bool?,
    );
  }
}

class ChunkUploadService {
  static const int defaultChunkSize = 5 * 1024 * 1024; // 5MB
  static const int minChunkSize = 100 * 1024; // 100KB for chunking
  
  final AppSettingsService _appSettingsService;

  ChunkUploadService(this._appSettingsService);

  /// Determine if chunked upload should be used based on file size
  bool shouldUseChunkedUpload(int fileSize) {
    return fileSize > minChunkSize;
  }

  /// Calculate optimal chunk size based on file size
  int getOptimalChunkSize(int fileSize) {
    if (fileSize < 10 * 1024 * 1024) return 1 * 1024 * 1024; // 1MB for files < 10MB
    if (fileSize < 100 * 1024 * 1024) return 5 * 1024 * 1024; // 5MB for files < 100MB
    if (fileSize < 1024 * 1024 * 1024) return 10 * 1024 * 1024; // 10MB for files < 1GB
    return 20 * 1024 * 1024; // 20MB for larger files
  }

  /// Initialize a chunked upload session
  Future<ChunkUploadInitResponse> initializeChunkUpload(ChunkUploadInitDto dto) async {
    final serverEndpoint = Store.get(StoreKey.serverEndpoint);
    final url = Uri.parse('$serverEndpoint/assets/upload/init');
    final headers = ApiService.getRequestHeaders();
    headers['Content-Type'] = 'application/json';

    final response = await http.post(
      url,
      headers: headers,
      body: json.encode(dto.toJson()),
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to initialize chunked upload: ${response.statusCode}');
    }

    final responseData = json.decode(response.body) as Map<String, dynamic>;
    return ChunkUploadInitResponse.fromJson(responseData);
  }

  /// Upload a chunk of data
  Future<ChunkUploadResponse> uploadChunk({
    required String uploadId,
    required int chunkIndex,
    required Uint8List chunkData,
    Function(int sent, int total)? onProgress,
  }) async {
    final serverEndpoint = Store.get(StoreKey.serverEndpoint);
    final url = Uri.parse('$serverEndpoint/assets/upload/$uploadId/chunk/$chunkIndex');
    final headers = ApiService.getRequestHeaders();

    final request = http.MultipartRequest('PUT', url);
    request.headers.addAll(headers);
    
    final multipartFile = http.MultipartFile.fromBytes(
      'chunk',
      chunkData,
      filename: 'chunk_$chunkIndex',
    );
    request.files.add(multipartFile);

    final streamedResponse = await request.send();
    
    if (streamedResponse.statusCode != 200) {
      throw Exception('Failed to upload chunk $chunkIndex: ${streamedResponse.statusCode}');
    }

    final responseBody = await streamedResponse.stream.bytesToString();
    final responseData = json.decode(responseBody) as Map<String, dynamic>;
    return ChunkUploadResponse.fromJson(responseData);
  }

  /// Complete the chunked upload
  Future<ChunkUploadCompleteResponse> completeChunkUpload({
    required String uploadId,
    String? checksum,
  }) async {
    final serverEndpoint = Store.get(StoreKey.serverEndpoint);
    final url = Uri.parse('$serverEndpoint/assets/upload/$uploadId/complete');
    final headers = ApiService.getRequestHeaders();
    headers['Content-Type'] = 'application/json';

    final body = <String, dynamic>{};
    if (checksum != null) {
      body['checksum'] = checksum;
    }

    final response = await http.post(
      url,
      headers: headers,
      body: json.encode(body),
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to complete chunked upload: ${response.statusCode}');
    }

    final responseData = json.decode(response.body) as Map<String, dynamic>;
    return ChunkUploadCompleteResponse.fromJson(responseData);
  }

  /// Cancel a chunked upload session
  Future<void> cancelChunkUpload(String uploadId) async {
    final serverEndpoint = Store.get(StoreKey.serverEndpoint);
    final url = Uri.parse('$serverEndpoint/assets/upload/$uploadId');
    final headers = ApiService.getRequestHeaders();

    final response = await http.delete(url, headers: headers);

    if (response.statusCode != 204) {
      throw Exception('Failed to cancel chunked upload: ${response.statusCode}');
    }
  }

  /// Upload a file using chunked upload
  Future<ChunkUploadCompleteResponse> uploadFileChunked({
    required File file,
    required String deviceAssetId,
    required String deviceId,
    required DateTime fileCreatedAt,
    required DateTime fileModifiedAt,
    String? duration,
    String? visibility,
    String? livePhotoVideoId,
    String? checksum,
    Function(int sent, int total)? onProgress,
    Function(int chunkIndex, int totalChunks)? onChunkComplete,
  }) async {
    final fileSize = await file.length();
    final chunkSize = getOptimalChunkSize(fileSize);
    final totalChunks = (fileSize / chunkSize).ceil();

    // Initialize upload session
    final initDto = ChunkUploadInitDto(
      filename: file.path.split('/').last,
      totalSize: fileSize,
      totalChunks: totalChunks,
      deviceAssetId: deviceAssetId,
      deviceId: deviceId,
      fileCreatedAt: fileCreatedAt,
      fileModifiedAt: fileModifiedAt,
      duration: duration,
      visibility: visibility,
      livePhotoVideoId: livePhotoVideoId,
      checksum: checksum,
    );

    final initResponse = await initializeChunkUpload(initDto);

    // If already completed (duplicate), return early
    if (initResponse.status == 'completed' && initResponse.assetId != null) {
      return ChunkUploadCompleteResponse(
        id: initResponse.assetId!,
        status: 'duplicate',
      );
    }

    // Upload chunks
    final fileStream = file.openRead();
    int uploadedBytes = 0;
    int chunkIndex = 0;

    await for (final chunk in fileStream) {
      final chunkBytes = Uint8List.fromList(chunk);
      final actualChunkSize = chunkBytes.length;

      await uploadChunk(
        uploadId: initResponse.uploadId,
        chunkIndex: chunkIndex,
        chunkData: chunkBytes,
        onProgress: (sent, total) {
          final totalSent = uploadedBytes + sent;
          onProgress?.call(totalSent, fileSize);
        },
      );

      uploadedBytes += actualChunkSize;
      chunkIndex++;
      onChunkComplete?.call(chunkIndex, totalChunks);

      // Break if we've read all chunks
      if (uploadedBytes >= fileSize) break;
    }

    // Complete the upload
    return await completeChunkUpload(
      uploadId: initResponse.uploadId,
      checksum: checksum,
    );
  }
}