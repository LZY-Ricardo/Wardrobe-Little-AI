/**
 * 压缩图片文件
 * 通过 Canvas 重新绘制图片来实现压缩，支持尺寸缩放和质量调整
 * 确保压缩后的图片大小在5KB到5MB之间
 * @param {File} file - 原始图片文件
 * @param {number} quality - 压缩质量 (0-1，默认0.8，值越小文件越小但质量越低)
 * @param {number} maxWidth - 最大宽度 (默认800px)
 * @param {number} maxHeight - 最大高度 (默认800px)
 * @returns {Promise<Blob>} 压缩后的图片 Blob 对象
 */
export const compressImage = (file, quality = 0.8, maxWidth = 800, maxHeight = 800) => {
    return new Promise((resolve, reject) => {
        const MIN_SIZE = 5 * 1024; // 5KB
        const MAX_SIZE = 5 * 1024 * 1024; // 5MB
        
        // 创建 Canvas 元素用于图片重绘
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();

        // 压缩函数
        const compressWithParams = (width, height, quality) => {
            return new Promise((resolve) => {
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                
                canvas.toBlob(
                    (blob) => {
                        resolve(blob);
                    },
                    'image/jpeg',
                    quality
                );
            });
        };

        // 图片加载完成后的处理
        img.onload = async () => {
            try {
                // 获取原始图片尺寸
                let { width, height } = img;
                let currentQuality = quality;
                let currentMaxWidth = maxWidth;
                let currentMaxHeight = maxHeight;

                // 按比例缩放图片尺寸，保持宽高比
                const calculateDimensions = (maxW, maxH) => {
                    let w = width;
                    let h = height;
                    
                    if (w > h) {
                        if (w > maxW) {
                            h = (h * maxW) / w;
                            w = maxW;
                        }
                    } else {
                        if (h > maxH) {
                            w = (w * maxH) / h;
                            h = maxH;
                        }
                    }
                    
                    return { width: w, height: h };
                };

                let dimensions = calculateDimensions(currentMaxWidth, currentMaxHeight);
                let compressedBlob = await compressWithParams(dimensions.width, dimensions.height, currentQuality);

                // 如果压缩后的图片太大，逐步降低质量和尺寸
                while (compressedBlob.size > MAX_SIZE && (currentQuality > 0.1 || currentMaxWidth > 200)) {
                    if (currentQuality > 0.1) {
                        currentQuality -= 0.1;
                    } else {
                        currentMaxWidth = Math.max(200, currentMaxWidth * 0.8);
                        currentMaxHeight = Math.max(200, currentMaxHeight * 0.8);
                        currentQuality = 0.1;
                    }
                    
                    dimensions = calculateDimensions(currentMaxWidth, currentMaxHeight);
                    compressedBlob = await compressWithParams(dimensions.width, dimensions.height, currentQuality);
                }

                // 如果压缩后的图片太小，逐步提高质量
                while (compressedBlob.size < MIN_SIZE && currentQuality < 1.0) {
                    currentQuality = Math.min(1.0, currentQuality + 0.1);
                    compressedBlob = await compressWithParams(dimensions.width, dimensions.height, currentQuality);
                    
                    // 如果提高质量后仍然太小，尝试增加尺寸
                    if (compressedBlob.size < MIN_SIZE && currentQuality >= 1.0) {
                        currentMaxWidth = Math.min(width, currentMaxWidth * 1.2);
                        currentMaxHeight = Math.min(height, currentMaxHeight * 1.2);
                        dimensions = calculateDimensions(currentMaxWidth, currentMaxHeight);
                        compressedBlob = await compressWithParams(dimensions.width, dimensions.height, currentQuality);
                    }
                }

                // 最终检查，如果仍然不在范围内，使用边界值
                if (compressedBlob.size > MAX_SIZE) {
                    // 强制使用最小质量和尺寸
                    dimensions = calculateDimensions(200, 200);
                    compressedBlob = await compressWithParams(dimensions.width, dimensions.height, 0.1);
                }

                resolve(compressedBlob);
            } catch (error) {
                reject(error);
            }
        };

        // 图片加载失败的处理
        img.onerror = () => reject(new Error('图片加载失败'));
        
        // 开始加载图片
        img.src = URL.createObjectURL(file);
    });
};

/**
 * 将 Blob 对象转换为 base64 编码字符串
 * 用于将二进制图片数据转换为可存储的字符串格式
 * @param {Blob} blob - 需要转换的 Blob 对象
 * @returns {Promise<string>} 返回 base64 编码的数据URL字符串 (格式: data:image/jpeg;base64,xxx)
 */
export const blobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
        // 创建 FileReader 实例用于读取文件
        const reader = new FileReader();
        
        // 读取成功时返回 base64 结果
        reader.onload = () => resolve(reader.result);
        
        // 读取失败时抛出错误
        reader.onerror = reject;
        
        // 以 DataURL 格式读取 Blob (会自动转换为 base64)
        reader.readAsDataURL(blob);
    });
};

/**
 * 格式化文件大小显示
 * 将字节数转换为人类可读的文件大小格式
 * @param {number} bytes - 文件大小（字节数）
 * @returns {string} 格式化后的文件大小字符串 (如: "1.5 MB", "256 KB")
 */
export const formatFileSize = (bytes) => {
    // 处理 0 字节的特殊情况
    if (bytes === 0) return '0 Bytes';
    
    // 定义转换基数和单位数组
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    
    // 计算应该使用的单位索引
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    // 计算转换后的数值并保留两位小数
    const convertedSize = parseFloat((bytes / Math.pow(k, i)).toFixed(2));
    
    // 返回格式化后的字符串
    return convertedSize + ' ' + sizes[i];
};