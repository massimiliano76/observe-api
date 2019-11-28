import config from 'config';
import path from 'path';
import { emptyDir, remove } from 'fs-extra';
import sharp from 'sharp';
import { exiftool } from 'exiftool-vendored';
import { mediaUrl } from '../utils';

const { store, sizes } = config.get('media');
const mediaPath = path.join(__dirname, '..', '..', store.path);

export async function clearMediaStore () {
  await emptyDir(mediaPath);
}

export function getMediaSizeUrl (id, size) {
  // Include suffix, if passed.
  return `${mediaUrl()}/${id}-${size}.jpg`;
}

export function getAllMediaUrls (id) {
  return sizes.reduce((acc, i) => {
    acc[i.id] = getMediaSizeUrl(id, i.id);
    return acc;
  }, {});
}

export async function persistImageBase64 (name, data, meta) {
  const baseFilePath = path.join(mediaPath, name);
  const originalFilePath = `${baseFilePath}.jpg`;
  const { lon, lat, heading, createdAt } = meta;

  try {
    // Get buffer from input data
    const inputBuffer = Buffer.from(data, 'base64');

    // Write original file for manipulation
    await sharp(inputBuffer)
      .withMetadata()
      .toFile(originalFilePath);

    // Update location related EXIF tags
    await exiftool.write(originalFilePath, {
      AllDates: createdAt.toISOString(),
      GPSLatitudeRef: lat >= 0 ? 'N' : 'S',
      GPSLatitude: Math.abs(lat),
      GPSLongitudeRef: lon >= 0 ? 'E' : 'W',
      GPSLongitude: Math.abs(lon),
      GPSDestBearingRef: 'T',
      GPSDestBearing: heading
    });

    // Write resized files
    for (let i = 0; i < sizes.length; i++) {
      const { id, width, height, fit } = sizes[i];
      const resizedFilePath = `${baseFilePath}-${id}.jpg`;
      await sharp(originalFilePath)
        .withMetadata()
        .resize(width, height, { fit })
        .toFile(resizedFilePath);
    }
  } finally {
    // Remove file generated by "exiftool-vendored" module
    await remove(`${originalFilePath}_original`);

    // Remove original file
    await remove(originalFilePath);
  }
}
