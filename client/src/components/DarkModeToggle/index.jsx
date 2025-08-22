import React, { useState, useEffect } from 'react';
import styles from './index.module.less';
import SvgIcon from '../SvgIcon';

const DarkModeToggle = () => {
  const [isDarkMode, setIsDarkMode] = useState(false);

  // 初始化暗黑模式状态
  useEffect(() => {
    const savedMode = localStorage.getItem('darkMode');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const shouldUseDark = savedMode ? JSON.parse(savedMode) : prefersDark;
    
    setIsDarkMode(shouldUseDark);
    applyDarkMode(shouldUseDark);
  }, []);

  // 应用暗黑模式样式
  const applyDarkMode = (isDark) => {
    const htmlElement = document.documentElement;
    if (isDark) {
      htmlElement.classList.add('dark-mode');
    } else {
      htmlElement.classList.remove('dark-mode');
    }
  };

  // 切换暗黑模式
  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    applyDarkMode(newMode);
    localStorage.setItem('darkMode', JSON.stringify(newMode));
  };

  return (
    <div className={styles['dark-mode-toggle']} onClick={toggleDarkMode}>
      <div className={`${styles['toggle-container']} ${isDarkMode ? styles['dark'] : ''}`}>
        <div className={styles['toggle-slider']}>
          {isDarkMode ? (
            <span className={styles['icon']}>🌙</span>
          ) : (
            <span className={styles['icon']}>☀️</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default DarkModeToggle;