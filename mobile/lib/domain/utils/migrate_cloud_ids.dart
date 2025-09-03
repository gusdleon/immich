import 'package:drift/drift.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/asset/asset_metadata.model.dart';
import 'package:immich_mobile/infrastructure/repositories/db.repository.dart';
import 'package:immich_mobile/infrastructure/repositories/local_album.repository.dart';
import 'package:immich_mobile/platform/native_sync_api.g.dart';
import 'package:immich_mobile/providers/api.provider.dart';
import 'package:immich_mobile/providers/infrastructure/db.provider.dart';
import 'package:immich_mobile/providers/infrastructure/sync.provider.dart';
// ignore: import_rule_openapi
import 'package:openapi/api.dart';

Future<void> migrateCloudIds(ProviderContainer ref) async {
  final db = ref.read(driftProvider);
  // Populate cloud IDs for local assets that don't have one yet
  await _populateCloudIds(db);

  // Wait for remote sync to complete, so we have up-to-date asset metadata entries
  await ref.read(syncStreamServiceProvider).sync();

  // Fetch the mapping for backed up assets that have a cloud ID locally but do not have a cloud ID on the server
  final mappingsToUpdate = await _fetchCloudIdMappings(db);
  final assetApi = ref.read(apiServiceProvider).assetsApi;
  for (final mapping in mappingsToUpdate) {
    final mobileMeta = AssetMetadataUpsertItemDto(
      key: AssetMetadataKey.mobileApp,
      value: RemoteAssetMobileAppMetadata(cloudId: mapping.cloudId).toMap(),
    );
    await assetApi.updateAssetMetadata(mapping.assetId, AssetMetadataUpsertDto(items: [mobileMeta]));
  }
}

Future<void> _populateCloudIds(Drift drift) async {
  final query = drift.localAssetEntity.selectOnly()
    ..addColumns([drift.localAssetEntity.id])
    ..where(drift.localAssetEntity.cloudId.isNull());
  final ids = await query.map((row) => row.read(drift.localAssetEntity.id)!).get();
  final cloudMapping = await NativeSyncApi().getCloudIdForAssetIds(ids);
  await DriftLocalAlbumRepository(drift).updateCloudMapping(cloudMapping);
}

typedef _CloudIdMapping = ({String assetId, String cloudId});

Future<List<_CloudIdMapping>> _fetchCloudIdMappings(Drift drift) async {
  final query =
      drift.remoteAssetEntity.selectOnly().join([
          leftOuterJoin(
            drift.localAssetEntity,
            drift.localAssetEntity.checksum.equalsExp(drift.remoteAssetEntity.checksum),
            useColumns: false,
          ),
          leftOuterJoin(
            drift.remoteAssetMetadataEntity,
            drift.remoteAssetMetadataEntity.assetId.equalsExp(drift.remoteAssetEntity.id) &
                drift.remoteAssetMetadataEntity.key.equals(RemoteAssetMetadataKey.mobileApp.key),
            useColumns: false,
          ),
        ])
        ..addColumns([drift.remoteAssetEntity.id, drift.localAssetEntity.cloudId])
        ..where(
          drift.localAssetEntity.id.isNotNull() &
              drift.localAssetEntity.cloudId.isNotNull() &
              drift.remoteAssetMetadataEntity.cloudId.isNull(),
        );
  return query
      .map(
        (row) => (assetId: row.read(drift.remoteAssetEntity.id)!, cloudId: row.read(drift.localAssetEntity.cloudId)!),
      )
      .get();
}
