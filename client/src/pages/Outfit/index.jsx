import React, { useState, useEffect, useCallback } from 'react'
import SvgIcon from '@/components/SvgIcon'
import white from '@/assets/white.jpg'
import styles from './index.module.less'
import { useNavigate } from 'react-router-dom'
import axios from '@/api'
import { Overlay, Dialog } from 'react-vant';
import { Toast } from 'antd-mobile'




// 生成随机颜色的函数
const generateRandomColor = () => {
  const colors = [
    { bg: '#FFE4E1', text: '#8B0000' }, // 浅粉红 + 深红
    { bg: '#E6F3FF', text: '#0066CC' }, // 浅蓝 + 深蓝
    { bg: '#F0FFF0', text: '#006400' }, // 浅绿 + 深绿
    { bg: '#FFF8DC', text: '#B8860B' }, // 浅黄 + 深黄
    { bg: '#F5F0FF', text: '#6A0DAD' }, // 浅紫 + 深紫
    { bg: '#FFE4B5', text: '#FF8C00' }, // 浅橙 + 深橙
  ];
  return colors[Math.floor(Math.random() * colors.length)];
};

export default function outfit() {
  const [visible, setVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null); // 存储当前选中的衣物
  const [itemColors, setItemColors] = useState({}); // 存储每个衣物项目的颜色
  const [SelectType, setSelectType] = useState(['全部', '上衣', '下衣', '鞋子', '配饰'])
  const [SelectColor, setSelectColor] = useState(['全部', '白色', '黑色', '红色'])
  const [SelectSeason, setSelectSeason] = useState(['全部', '春季', '夏季', '秋季', '冬季'])
  const [SelectStyle, setSelectStyle] = useState(['全部', '休闲', '通勤', '运动'])

  const navigate = useNavigate()
  const [clothesList, setClothesList] = useState([]) // 所有衣物数据
  const [filteredClothes, setFilteredClothes] = useState([]); // 过滤后的数据
  const [filters, setFilters] = useState({
    type: '全部',
    color: '全部',
    season: '全部',
    style: '全部'
  });
  const [searchKeyword, setSearchKeyword] = useState(''); // 搜索关键词


  // 综合过滤函数
  const filterClothes = useCallback(() => {
    let filtered = clothesList

    // 按类型过滤
    if (filters.type !== '全部') {
      filtered = filtered.filter(item => item.type.includes(filters.type))
    }

    // 按颜色过滤
    if (filters.color !== '全部') {
      filtered = filtered.filter(item => item.color.includes(filters.color))
    }

    // 按季节过滤
    if (filters.season !== '全部') {
      filtered = filtered.filter(item => item.season.includes(filters.season))
    }

    // 按风格过滤
    if (filters.style !== '全部') {
      filtered = filtered.filter(item => item.style.includes(filters.style))
    }

    // 按搜索关键词过滤
    if (searchKeyword.trim()) {
      filtered = filtered.filter(item =>
        item.name.includes(searchKeyword) ||
        item.type.includes(searchKeyword) ||
        item.color.includes(searchKeyword) ||
        item.season.includes(searchKeyword) ||
        item.style.includes(searchKeyword)
      );
    }

    setFilteredClothes(filtered)
  }, [clothesList, filters, searchKeyword])

  // 从后端获取全部衣物数据
  const getClothesData = async () => {
    const res = await axios.get('/clothes/all')
    console.log('获取到的所有衣物数据', res);
    setClothesList(res.data)
    setFilteredClothes(res.data)
  }

  // 处理筛选点击事件
  const handleFilterClick = (filterType, filterValue) => {
    setFilters(prev => ({
      ...prev,
      [filterType]: filterValue
    }))
  }

  // 为衣物项目生成颜色
  const generateColorsForItems = (items) => {
    const colors = {}
    items.forEach((item, index) => {
      colors[index] = {
        name: generateRandomColor(),
        style: generateRandomColor(),
        season: generateRandomColor()
      }
    })
    setItemColors(colors)
  }

  // 删除衣物
  const handleDelete = async () => {
    // console.log('删除衣物:', selectedItem.cloth_id);
    if (selectedItem) {
      try {
        const res = await axios.delete(`/clothes/${selectedItem.cloth_id}`)
        getClothesData()
        setVisible(false)
        // console.log('res',res);
        Toast.show({
          icon: 'success',
          content: '删除成功',
          duration: 1000
        })
      } catch (error) {
        console.error('删除衣物失败:', error)
      }
    }
  }

  useEffect(() => {
    getClothesData()
  }, [])

  useEffect(() => {
    if (filteredClothes.length > 0) {
      generateColorsForItems(filteredClothes)
    }
  }, [filteredClothes])

  useEffect(() => {
    filterClothes()
  }, [filterClothes])

  return (
    <div className={styles.outfit}>

      <div className={styles.header}>
        <div className={styles['header-left']}>我的衣柜</div>
        <div className={styles['search-box']}>
          <input
            type='text'
            placeholder='搜索衣物...'
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            className={styles['search-input']}
          />
        </div>
        <div className={styles['header-right']} onClick={() => navigate('/add')}>
          <SvgIcon iconName='icon-jiahao-copy' />
        </div>
      </div>

      <div className={styles.container}>
        <div className={styles.select}>
          <div className={styles['select-type']}>
            {
              SelectType.map((type, index) => (
                <div
                  key={index}
                  className={`${styles['type-item']} ${type === filters.type ? styles['type-item-active'] : ''}`}
                  onClick={() => handleFilterClick('type', type)}
                >{type}
                </div>
              ))
            }
          </div>
          <div className={styles['select-color']}>
            {
              SelectColor.map(color => (
                <div
                  key={color}
                  className={`${styles['color-item']} ${color === filters.color ? styles['color-item-active'] : ''}`}
                  onClick={() => handleFilterClick('color', color)}
                >{color}
                </div>
              ))
            }
          </div>
          <div className={styles['select-season']}>
            {
              SelectSeason.map(season => (
                <div
                  key={season}
                  className={`${styles['season-item']} ${season === filters.season ? styles['season-item-active'] : ''}`}
                  onClick={() => handleFilterClick('season', season)}
                >{season}
                </div>
              ))
            }
          </div>
          <div className={styles['select-style']}>
            {
              SelectStyle.map(style => (
                <div
                  key={style}
                  className={`${styles['style-item']} ${style === filters.style ? styles['style-item-active'] : ''}`}
                  onClick={() => handleFilterClick('style', style)}
                >{style}
                </div>
              ))
            }
          </div>
        </div>
        <div className={styles.clothes}>
          {filteredClothes.length > 0 ? (
            filteredClothes.map((item, index) => (
              <div key={index} className={styles['clothes-item']} onClick={() => {
                setSelectedItem(item);
                setVisible(true);
              }}>
                <div className={styles['clothes-img']}>
                  <img src={item.image || white} alt={item.name} />
                </div>
                <div className={styles.label}>
                  <div
                    className={styles['label-item']}
                    style={{
                      backgroundColor: itemColors[index]?.name?.bg || '#f5f5f5',
                      color: itemColors[index]?.name?.text || '#333'
                    }}
                  >{item.name}</div>
                  <div
                    className={styles['label-item']}
                    style={{
                      backgroundColor: itemColors[index]?.style?.bg || '#f5f5f5',
                      color: itemColors[index]?.style?.text || '#333'
                    }}
                  >{item.style}</div>
                  <div
                    className={styles['label-item']}
                    style={{
                      backgroundColor: itemColors[index]?.season?.bg || '#f5f5f5',
                      color: itemColors[index]?.season?.text || '#333'
                    }}
                  >{item.season}</div>
                </div>
              </div>
            ))
          ) : (
            <div className={styles['no-data']}>暂无符合条件的衣物</div>
          )}
        </div>
      </div>
      <Overlay visible={visible} onClick={() => setVisible(false)}
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0'
        }}>
        <div className={styles['overlay-content']} onClick={(e) => e.stopPropagation()}>
          {selectedItem && (
            <>
              <div className={styles['detail-image']}>
                <img src={selectedItem.image || white} alt={selectedItem.name} />
              </div>
              <div className={styles['detail-info']}>
                <h3 className={styles['detail-title']}>{selectedItem.name}</h3>
                <div className={styles['detail-row']}>
                  <span className={styles['detail-label']}>类型：</span>
                  <span className={styles['detail-value']}>{selectedItem.type || '未知'}</span>
                </div>
                <div className={styles['detail-row']}>
                  <span className={styles['detail-label']}>颜色：</span>
                  <span className={styles['detail-value']}>{selectedItem.color || '未知'}</span>
                </div>
                <div className={styles['detail-row']}>
                  <span className={styles['detail-label']}>适宜季节：</span>
                  <span className={styles['detail-value']}>{selectedItem.season || '未知'}</span>
                </div>
                <div className={styles['detail-row']}>
                  <span className={styles['detail-label']}>风格：</span>
                  <span className={styles['detail-value']}>{selectedItem.style || '未知'}</span>
                </div>
                <div className={styles['detail-row']}>
                  <span className={styles['detail-label']}>材质：</span>
                  <span className={styles['detail-value']}>{selectedItem.material || '未知'}</span>
                </div>
                <div className={styles['detail-row']}>
                  <span className={styles['detail-label']}>常用程度：</span>
                  <span className={styles['detail-value']}>{selectedItem.favorite === 1 ? '常用' : '不常用'}</span>
                </div>

                <div className={styles['delete-button-container']}>
                  <button className={styles['delete-button']} onClick={() =>
                    Dialog.confirm({
                      message: '确定删除该衣物吗？',
                      onCancel: () => console.log('cancel'),
                      onConfirm: () => handleDelete(),
                    })
                  }>
                    删除衣物
                  </button>
                  <button
                    className={styles['update-button']}
                    onClick={() => navigate('/update', { state: selectedItem })}
                  >
                    更新衣物
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </Overlay>
    </div>
  )
}
