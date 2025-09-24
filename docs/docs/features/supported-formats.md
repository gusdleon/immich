# Supported Media Formats

Immich supports a number of image and video formats, the most common of which are outlined here.

:::note
For the full list, refer to the [Immich source code](https://github.com/immich-app/immich/blob/main/server/src/utils/mime-types.ts).
:::

## 360° Media Support

Immich provides comprehensive support for 360° spherical photos and videos with an immersive viewer experience.

### 360° Detection

360° content is automatically detected through multiple methods:

- **Standard GPano metadata**: `ProjectionType`, `GPano:UsePanoramaViewer`, `GPano:ProjectionType`
- **Insta360 X4 optimized**: Enhanced detection for `.insp` (photos) and `.insv` (videos) files
- **Video spherical metadata**: `SphericalVideo`, `SpatialAudio` tags
- **Camera make detection**: Automatic recognition of Insta360 and other 360° camera brands

### Supported Projection Types

- `EQUIRECTANGULAR` - Standard 360° spherical projection
- `CYLINDRICAL` - Cylindrical panoramic projection  
- `CUBEMAP` - Cubic projection mapping
- Additional projection types as detected from EXIF metadata

### 360° Viewer Features

- **Interactive navigation**: Mouse drag (desktop) and touch gestures (mobile)
- **Photo sphere viewer**: Full 360° photo exploration with zoom controls
- **360° video playback**: Immersive video viewing with perspective control
- **Resolution switching**: Automatic high-quality loading on zoom
- **Seamless integration**: Automatic activation when 360° content is detected

## Image formats

| Format      | Extension(s)                  |     Supported?     | Notes           |
| :---------- | :---------------------------- | :----------------: | :-------------- |
| `AVIF`      | `.avif`                       | :white_check_mark: |                 |
| `BMP`       | `.bmp`                        | :white_check_mark: |                 |
| `GIF`       | `.gif`                        | :white_check_mark: |                 |
| `HEIC`      | `.heic`                       | :white_check_mark: |                 |
| `HEIF`      | `.heif`                       | :white_check_mark: |                 |
| `JPEG 2000` | `.jp2`                        | :white_check_mark: |                 |
| `JPEG`      | `.jpeg` `.jpg` `.jpe` `.insp` | :white_check_mark: | `.insp` = Insta360 360° photos |
| `JPEG XL`   | `.jxl`                        | :white_check_mark: |                 |
| `PNG`       | `.png`                        | :white_check_mark: |                 |
| `PSD`       | `.psd`                        | :white_check_mark: | Adobe Photoshop |
| `RAW`       | `.raw`                        | :white_check_mark: |                 |
| `RW2`       | `.rw2`                        | :white_check_mark: |                 |
| `SVG`       | `.svg`                        | :white_check_mark: |                 |
| `TIFF`      | `.tif` `.tiff`                | :white_check_mark: |                 |
| `WEBP`      | `.webp`                       | :white_check_mark: |                 |

## Video formats

| Format      | Extension(s)          |     Supported?     | Notes |
| :---------- | :-------------------- | :----------------: | :---- |
| `3GPP`      | `.3gp` `.3gpp`        | :white_check_mark: |       |
| `AVI`       | `.avi`                | :white_check_mark: |       |
| `FLV`       | `.flv`                | :white_check_mark: |       |
| `M4V`       | `.m4v`                | :white_check_mark: |       |
| `MATROSKA`  | `.mkv`                | :white_check_mark: |       |
| `MP2T`      | `.mts` `.m2ts` `.m2t` | :white_check_mark: |       |
| `MP4`       | `.mp4` `.insv`        | :white_check_mark: | `.insv` = Insta360 360° videos |
| `MPEG`      | `.mpg` `.mpe` `.mpeg` | :white_check_mark: |       |
| `QUICKTIME` | `.mov`                | :white_check_mark: |       |
| `WEBM`      | `.webm`               | :white_check_mark: |       |
| `WMV`       | `.wmv`                | :white_check_mark: |       |
