export const MAX_FILE_SIZE = 25 * 1024 * 1024;
export const ACCEPTED_EXTENSIONS = [
  'pdf',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'txt',
  'md',
  'csv',
  'docx',
  'xlsx',
  'pptx',
  'zip',
] as const;

export const fileInputAccept = ACCEPTED_EXTENSIONS.map((ext) => `.${ext}`).join(',');

export function isAcceptedFile(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return (ACCEPTED_EXTENSIONS as readonly string[]).includes(extension);
}

export function uploadToSignedUrl(
  url: string,
  file: File,
  onProgress: (percent: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', url);
    request.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error(`El almacenamiento respondió ${request.status}`));
    };
    request.onerror = () => reject(new Error('No se pudo contactar con el almacenamiento.'));
    request.send(file);
  });
}

export async function sha256(file: File) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
