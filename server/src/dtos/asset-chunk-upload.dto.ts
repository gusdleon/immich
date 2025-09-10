import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { Optional, ValidateBoolean, ValidateDate, ValidateEnum, ValidateUUID } from 'src/validation';
import { AssetVisibility } from 'src/enum';

export class ChunkUploadInitDto {
  @IsNotEmpty()
  @IsString()
  filename!: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  totalSize!: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  totalChunks!: number;

  @IsNotEmpty()
  @IsString()
  deviceAssetId!: string;

  @IsNotEmpty()
  @IsString()
  deviceId!: string;

  @ValidateDate()
  fileCreatedAt!: Date;

  @ValidateDate()
  fileModifiedAt!: Date;

  @Optional()
  @IsString()
  duration?: string;

  @Optional()
  @ValidateEnum({ enum: AssetVisibility, name: 'AssetVisibility' })
  visibility?: AssetVisibility;

  @Optional()
  @ValidateUUID()
  livePhotoVideoId?: string;

  @Optional()
  @IsString()
  checksum?: string;

  @Optional()
  @ValidateBoolean()
  isFavorite?: boolean;
}

export class ChunkUploadDto {
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  chunkIndex!: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  chunkSize!: number;

  @ApiProperty({ type: 'string', format: 'binary' })
  chunk!: any;
}

export class ChunkUploadCompleteDto {
  @IsOptional()
  @IsString()
  checksum?: string;
}

export class ChunkUploadResponseDto {
  @IsUUID()
  uploadId!: string;

  @IsNumber()
  @Min(0)
  chunkIndex!: number;

  @IsString()
  status!: 'pending' | 'uploading' | 'completed' | 'error';
}

export class ChunkUploadInitResponseDto {
  @IsUUID()
  uploadId!: string;

  @IsNumber()
  chunkSize!: number;

  @IsString()
  status!: 'pending' | 'uploading' | 'completed' | 'error';

  @IsOptional()
  @IsString()
  assetId?: string;
}