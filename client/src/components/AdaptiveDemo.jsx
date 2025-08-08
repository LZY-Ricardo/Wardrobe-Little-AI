import React from 'react';
import './AdaptiveDemo.css';

const AdaptiveDemo = () => {
  return (
    <div className="adaptive-container">
      <h2 className="adaptive-title">移动端适配示例</h2>
      <div className="adaptive-box">375px宽度盒子</div>
      <div className="adaptive-box-half">187.5px宽度盒子</div>
      <p className="adaptive-text">这是16px的文本</p>
      <p className="adaptive-text-large">这是20px的文本</p>
      <div className="adaptive-grid">
        <div className="grid-item">1</div>
        <div className="grid-item">2</div>
        <div className="grid-item">3</div>
        <div className="grid-item">4</div>
      </div>
      <p className="adaptive-note">注意：所有px单位都会被自动转换为vw单位</p>
      <p className="ignore-adaptive-text">这个文本不会被转换 (使用ignore-前缀)</p>
    </div>
  );
};

export default AdaptiveDemo;