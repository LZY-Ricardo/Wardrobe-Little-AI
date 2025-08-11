import React, { useState, useRef } from 'react'
import styles from './index.module.less'
import SvgIcon from '@/components/SvgIcon'
import { Button, Toast, Dialog } from 'antd-mobile'
import { useNavigate } from 'react-router-dom'
import axios from '@/api'

export default function Add() {
    const navigate = useNavigate()
    const [imageUrl, setImageUrl] = useState('') // 上传的图片
    const [status, setStatus] = useState('') // 工作流状态
    const nameRef = useRef(null)
    const fileRef = useRef(null)
    const typeRef = useRef(null)
    const colorRef = useRef(null)
    const styleRef = useRef(null)
    const seasonRef = useRef(null)
    const materialRef = useRef(null)

    // 处理图片选择, 生成预览
    const handleImageChange = (e) => {
        const file = e.target.files[0]
        if (!file) return
        // 创建预览URL
        const reader = new FileReader()
        reader.readAsDataURL(file) // 读成base64
        reader.onload = () => {
            setImageUrl(reader.result)
        }
    }

    // 分析衣物
    const analyzeClothes = async () => {
        if (!fileRef.current.files[0]) {
            Toast.show({
                icon: 'fail',
                content: '请上传衣物图片',
                duration: 1000
            })
            return
        }
        setStatus('让您的衣物小助理睁大眼睛瞅瞅这是啥～')
        // 创建FormData对象
        const formData = new FormData()
        formData.append('image', fileRef.current.files[0])

        try {
            // 调用后端接口
            const res = await axios.post('/clothes/analyze', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            })
            console.log(res);
            if (res.code !== 1) {
                Toast.show({
                    icon: 'fail',
                    content: res.msg || '分析失败',
                    duration: 1000
                });
                setStatus('');
                return;
            }
            // 解析后端返回的字符串数据
            const data = JSON.parse(res.data);
            console.log('解析后的数据:', data);

            // 填充表单字段
            typeRef.current.value = data.type || '';
            colorRef.current.value = data.color || '';
            styleRef.current.value = data.style || '';
            seasonRef.current.value = data.season || '';
            materialRef.current.value = data.material || '';

            Toast.show({
                icon: 'success',
                content: '分析完成',
                duration: 1500
            });
            setStatus('');
        } catch (error) {
            console.error('分析衣物错误:', error);
            Toast.show({
                icon: 'fail',
                content: '分析失败',
                duration: 1500
            });
            setStatus('');
        }
    }

    const handleUploadImage = async () => {
        if (!nameRef.current.value) {
            Toast.show({
                icon: 'fail',
                content: '请输入衣物名称',
                duration: 1000
            })
            return
        }
        if (!typeRef.current.value) {
            Toast.show({
                icon: 'fail',
                content: '请输入衣物类型',
                duration: 1000
            })
            return
        }
        if (!colorRef.current.value) {
            Toast.show({
                icon: 'fail',
                content: '请输入衣物颜色',
                duration: 1000
            })
            return
        }
        if (!styleRef.current.value) {
            Toast.show({
                icon: 'fail',
                content: '请输入衣物风格',
                duration: 1000
            })
            return
        }
        if (!seasonRef.current.value) {
            Toast.show({
                icon: 'fail',
                content: '请输入衣物适宜季节',
                duration: 1000
            })
            return
        }
        const res = await axios.post('/clothes/uploadCloth', {
            name: nameRef.current.value,
            type: typeRef.current.value,
            color: colorRef.current.value,
            style: styleRef.current.value,
            season: seasonRef.current.value,
            material: materialRef.current.value,
            image: imageUrl,
        })
        console.log('上传衣物成功', res);
        setImageUrl('')
        nameRef.current.value = ''
        typeRef.current.value = ''
        colorRef.current.value = ''
        styleRef.current.value = ''
        seasonRef.current.value = ''
        materialRef.current.value = ''

        Toast.show({
            icon: 'success',
            content: '上传成功',
            duration: 1000
        })
    }

    return (
        <div className={styles.add}>
            <div className={styles.header}>
                <div className={styles.headerBack} onClick={() => { navigate(-1) }}>
                    <SvgIcon iconName="icon-fanhui" />
                </div>
                <div className={styles.headerTitle}>
                    添加衣物
                </div>
                <div
                    className={styles.headerQuestion}
                    onClick={() =>
                        Dialog.alert({
                            content: '麻烦您上传一下单件衣物的清晰照片哦，要是背景能简洁些就更好啦，辛苦您啦～',
                        })
                    }
                >
                    <SvgIcon iconName="icon-qm" />
                </div>
            </div>

            <div className={styles.container}>
                <div className={styles.name}>
                    <label htmlFor="name">衣物名称</label>
                    <input ref={nameRef} type="text" id="name" placeholder='请输入衣物名称' />

                </div>
                <div className={styles.img}>
                    <label htmlFor="img" className={styles.uploadBox}>
                        {
                            imageUrl ? (
                                <img src={imageUrl}
                                    alt="预览图"
                                    className={styles.previewImg}
                                />
                            ) : (
                                <div className={styles.uploadContent}>
                                    <SvgIcon iconName="icon-shangchuantupian" className={styles.cameraIcon} />
                                    <div className={styles.uploadText}>
                                        <p>点击上传图片</p>
                                        <p className={styles.uploadTip}>建议拍摄单件衣物, 光线充足更易识别</p>
                                    </div>
                                </div>
                            )
                        }
                        {status && <div className={styles.statusOverlay}>{status}</div>}
                    </label>
                    <input
                        ref={fileRef}
                        type="file"
                        id="img"
                        className={styles.fileInput}
                        accept='image/*'
                        capture="camera"
                        onChange={handleImageChange}
                    />
                </div>

                <div className={styles.analyzeBtn}>
                    <Button color='success' onClick={analyzeClothes}>分析衣物</Button>
                </div>

                <div className={styles.detail}>
                    <div className={styles.detailType}>
                        <label htmlFor="type">衣物类型</label>
                        <input ref={typeRef} type="text" id="type" placeholder='请输入衣物类型' />
                    </div>
                    <div className={styles.detailColor}>
                        <label htmlFor="color">衣物颜色</label>
                        <input ref={colorRef} type="text" id="color" placeholder='请输入衣物颜色' />
                    </div>
                    <div className={styles.detailStyle}>
                        <label htmlFor="style">衣物风格</label>
                        <input ref={styleRef} type="text" id="style" placeholder='请输入衣物风格' />

                    </div>
                    <div className={styles.detailSeason}>
                        <label htmlFor="season">季节</label>
                        <input ref={seasonRef} type="text" id='season' placeholder='请输入衣物适宜季节' />


                    </div>
                    <div className={styles.detailMaterial}>
                        <label htmlFor="material">衣物材质</label>
                        <input ref={materialRef} type="text" id="material" placeholder='请输入衣物材质(非必须)' />
                    </div>
                </div>

                <div className={styles.submit}>
                    <Button
                        color='primary'
                        block
                        onClick={handleUploadImage}
                    >确认添加到衣柜</Button>
                </div>
            </div>
        </div>
    )
}