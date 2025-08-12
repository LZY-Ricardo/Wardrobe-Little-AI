/**
 * 压缩图片
 * @param {File} file - 原始图片文件
 * @param {number} quality - 压缩质量 (0-1)
 * @param {number} maxWidth - 最大宽度
 * @param {number} maxHeight - 最大高度
 * @returns {Promise<Blob>} 压缩后的图片
 */
export const compressImage = (file, quality = 0.8, maxWidth = 800, maxHeight = 800) => {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();

        img.onload = () => {
            // 计算压缩后的尺寸
            let { width, height } = img;

            // 按比例缩放
            if (width > height) {
                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width = (width * maxHeight) / height;
                    height = maxHeight;
                }
            }

            canvas.width = width;
            canvas.height = height;

            // 绘制图片
            ctx.drawImage(img, 0, 0, width, height);

            // 转换为 Blob
            canvas.toBlob(
                (blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error('压缩失败'));
                    }
                },
                'image/jpeg',
                quality
            );
        };

        img.onerror = () => reject(new Error('图片加载失败'));
        img.src = URL.createObjectURL(file);
    });
};

/**
 * 将 Blob 转换为 base64
 * @param {Blob} blob 
 * @returns {Promise<string>}
 */
export const blobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

/**
 * 格式化文件大小显示
 * @param {number} bytes 
 * @returns {string}
 */
export const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};