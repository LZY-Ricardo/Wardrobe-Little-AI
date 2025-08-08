import React, { useState, useEffect } from 'react';
import { Button, Toast } from 'antd-mobile';

// 导入API
import { login } from '@/api/user';
import { getClothingList, getOutfitRecommendation } from '@/api/clothing';

const ApiUsageExample = () => {
  const [clothingList, setClothingList] = useState([]);
  const [recommendation, setRecommendation] = useState(null);
  const [loading, setLoading] = useState(false);

  // 获取服装列表示例
  const fetchClothingList = async () => {
    setLoading(true);
    try {
      const res = await getClothingList({ page: 1, pageSize: 10 });
      setClothingList(res.data || []);
      Toast.show({
        content: '获取服装列表成功',
        position: 'bottom',
      });
    } catch (error) {
      console.error('获取服装列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 登录示例
  const handleLogin = async () => {
    try {
      const res = await login({
        username: 'testuser',
        password: 'password123'
      });
      
      // 保存token到本地存储
      if (res.token) {
        localStorage.setItem('token', res.token);
        Toast.show({
          content: '登录成功',
          position: 'center',
        });
      }
    } catch (error) {
      console.error('登录失败:', error);
    }
  };

  // 获取穿搭推荐示例
  const fetchRecommendation = async () => {
    setLoading(true);
    try {
      const res = await getOutfitRecommendation({
        occasion: '日常',
        weather: '晴天',
        style: '休闲'
      });
      setRecommendation(res.data || null);
      Toast.show({
        content: '获取穿搭推荐成功',
        position: 'bottom',
      });
    } catch (error) {
      console.error('获取穿搭推荐失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 组件挂载时获取服装列表
  useEffect(() => {
    // 实际使用时取消注释
    // fetchClothingList();
  }, []);

  return (
    <div style={{ padding: '16px' }}>
      <h2>API使用示例</h2>
      
      <div style={{ marginBottom: '20px' }}>
        <Button color="primary" onClick={handleLogin} loading={loading}>
          登录
        </Button>
      </div>
      
      <div style={{ marginBottom: '20px' }}>
        <Button color="primary" onClick={fetchClothingList} loading={loading}>
          获取服装列表
        </Button>
        {clothingList.length > 0 && (
          <div style={{ marginTop: '10px' }}>
            <h3>服装列表：</h3>
            <ul>
              {clothingList.map(item => (
                <li key={item.id}>{item.name}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      
      <div>
        <Button color="primary" onClick={fetchRecommendation} loading={loading}>
          获取穿搭推荐
        </Button>
        {recommendation && (
          <div style={{ marginTop: '10px' }}>
            <h3>推荐穿搭：</h3>
            <p>上装：{recommendation.top?.name}</p>
            <p>下装：{recommendation.bottom?.name}</p>
            <p>鞋子：{recommendation.shoes?.name}</p>
            <p>配饰：{recommendation.accessories?.name}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ApiUsageExample;