/**
 * Compresses an image file using a canvas.
 * @param file The original image file.
 * @param maxWidth Max width in pixels.
 * @param maxHeight Max height in pixels.
 * @param quality Quality from 0 to 1.
 * @returns A promise that resolves to a compressed Blob.
 */
export async function compressImage(
  file: File,
  maxWidth = 1200,
  maxHeight = 1200,
  quality = 0.7
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Canvas to Blob failed'));
            }
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

/**
 * Utility to format dates in Thai style.
 */
export function formatThaiDate(date: string | Date) {
  return new Date(date).toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Utility to format phone numbers in Thai style (e.g. 085-835-3379 or 038-304-100)
 */
export function formatPhoneNumber(value: string): string {
  if (!value) return '';
  const clean = value.replace(/\D/g, '');
  
  if (clean.length === 0) return '';
  
  // Format for Thai landline e.g. 02-XXX-XXXX (9 digits)
  if (clean.startsWith('02')) {
    if (clean.length > 5) {
      return `${clean.slice(0, 2)}-${clean.slice(2, 5)}-${clean.slice(5, 9)}`;
    } else if (clean.length > 2) {
      return `${clean.slice(0, 2)}-${clean.slice(2, 5)}`;
    }
    return clean;
  }
  
  // Standard mobile (e.g. 085-835-3379, 10 digits) or other area codes (038-304-100, 9 digits)
  if (clean.length > 6) {
    const suffixLimit = clean.length > 9 ? 10 : 9;
    return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6, suffixLimit)}`;
  } else if (clean.length > 3) {
    return `${clean.slice(0, 3)}-${clean.slice(3, 6)}`;
  }
  return clean;
}

