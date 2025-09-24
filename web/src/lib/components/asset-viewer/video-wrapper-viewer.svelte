<script lang="ts">
  import { ProjectionType } from '$lib/constants';
  import VideoNativeViewer from '$lib/components/asset-viewer/video-native-viewer.svelte';
  import VideoPanoramaViewer from '$lib/components/asset-viewer/video-panorama-viewer.svelte';
  import type { AssetResponseDto } from '@immich/sdk';

  interface Props {
    assetId: string;
    projectionType: string | null | undefined;
    cacheKey: string | null;
    loopVideo: boolean;
    asset?: AssetResponseDto;
    onClose?: () => void;
    onPreviousAsset?: () => void;
    onNextAsset?: () => void;
    onVideoEnded?: () => void;
    onVideoStarted?: () => void;
  }

  let {
    assetId,
    projectionType,
    cacheKey,
    loopVideo,
    asset,
    onPreviousAsset,
    onClose,
    onNextAsset,
    onVideoEnded,
    onVideoStarted,
  }: Props = $props();

  // Enhanced 360° detection: check projection type or .insv file extension
  $: is360Video = projectionType === ProjectionType.EQUIRECTANGULAR || 
    (asset?.originalPath && asset.originalPath.toLowerCase().endsWith('.insv'));
</script>

{#if is360Video}
  <VideoPanoramaViewer {assetId} />
{:else}
  <VideoNativeViewer
    {loopVideo}
    {cacheKey}
    {assetId}
    {onPreviousAsset}
    {onNextAsset}
    {onVideoEnded}
    {onVideoStarted}
    {onClose}
  />
{/if}
