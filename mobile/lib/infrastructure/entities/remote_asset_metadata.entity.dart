import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:drift/extensions/json1.dart';
import 'package:immich_mobile/infrastructure/entities/remote_asset.entity.dart';
import 'package:immich_mobile/infrastructure/utils/drift_default.mixin.dart';

@TableIndex.sql('''
CREATE UNIQUE INDEX IF NOT EXISTS UQ_remote_asset_metadata_cloud_id ON remote_asset_metadata_entity (cloud_id) WHERE ("key" = 'mobile-app');
''')
class RemoteAssetMetadataEntity extends Table with DriftDefaultsMixin {
  const RemoteAssetMetadataEntity();

  TextColumn get assetId => text().references(RemoteAssetEntity, #id, onDelete: KeyAction.cascade)();

  TextColumn get key => text()();

  BlobColumn get value => blob().map(assetMetadataConverter)();

  TextColumn get cloudId => text().generatedAs(key.jsonExtract(r'$.iCloudId'), stored: true)();

  @override
  Set<Column> get primaryKey => {assetId, key};
}

final JsonTypeConverter2<Map<String, Object?>, Uint8List, Object?> assetMetadataConverter = TypeConverter.jsonb(
  fromJson: (json) => json as Map<String, Object?>,
  toJson: (value) => jsonEncode(value),
);
