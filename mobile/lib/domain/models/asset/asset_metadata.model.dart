import 'dart:convert';

enum RemoteAssetMetadataKey {
  mobileApp("mobile-app");

  final String key;

  const RemoteAssetMetadataKey(this.key);
}

class RemoteAssetMetadataItem {
  final RemoteAssetMetadataKey key;
  final Object value;

  const RemoteAssetMetadataItem({required this.key, required this.value});

  Map<String, Object?> toMap() {
    return {'key': key.key, 'value': value};
  }

  String toJson() => json.encode(toMap());
}

class RemoteAssetMobileAppMetadata {
  final String? cloudId;

  const RemoteAssetMobileAppMetadata({this.cloudId});

  Map<String, Object?> toMap() {
    final map = <String, Object?>{};
    if (cloudId != null) {
      map["iCloudId"] = cloudId;
    }

    return map;
  }

  String toJson() => json.encode(toMap());
}
