import SvgIcon from '@/components/SvgIcon'
import styles from './index.module.less'
import { useRef, useState } from 'react'
import { Toast } from 'antd-mobile'
import axios from '@/api'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'

export default function AiChat() {
    const inputRef = useRef(null)
    const [list, setList] = useState([])


    const [disabled, setDisabled] = useState(false);
    /**
     * 发送聊天消息并处理流式响应
     * 实现AI聊天的核心功能，包括流式数据接收和实时显示
     */
    const send = async () => {
        // 获取并验证用户输入
        const input = inputRef.current?.value?.trim()
        if (!input) {
            Toast.show({
                content: '请输入内容'
            })
            return
        }
        
        // 禁用发送按钮，防止重复提交
        console.log('Setting disabled to true');
        setDisabled(true);
        
        // 立即清空输入框，提升用户体验
        if (inputRef.current) {
            inputRef.current.value = ''
        }
        
        try {
            // 将用户消息添加到聊天列表
            setList(prev => [...prev, {
                role: 'user',
                content: input
            }])

            // 获取认证token和创建请求中断控制器
            const token = localStorage.getItem('access_token');
            const abortController = new AbortController();
            
            console.log('Sending request to server...');
            
            // 发送流式请求到后端API
            const response = await fetch(`http://localhost:3000/chat?message=${encodeURIComponent(input)}`, {
                headers: {
                    'Authorization': `Bearer ${token}` // 添加认证头
                },
                signal: abortController.signal // 支持请求中断
            });
            
            console.log('Response received:', response.status, response.statusText);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            console.log('Starting to read stream...');
            
            // 创建流式数据读取器和文本解码器
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let botResponse = ''; // 累积AI回复内容
            
            // 预先添加空的机器人消息占位符，用于后续更新
            setList(prev => [...prev, {
                role: 'bot',
                content: ''
            }]);
            
            // 流式读取控制变量
            let shouldBreak = false; // 控制循环退出的标志
            
            // 设置2分钟超时机制，防止长时间无响应
            let timeoutId = setTimeout(() => {
                console.log('Stream timeout, forcing end');
                shouldBreak = true;
                abortController.abort(); // 中断请求
                console.log('shouldBreak set to:', shouldBreak);
            }, 120000); // 2分钟超时作为备用方案
            
            console.log('Timeout set as backup (2 minutes)');
            
            // 主要的流式数据读取循环
            while (true) {
                // 检查是否需要退出循环
                if (shouldBreak) {
                    console.log('Stream ended, exiting loop');
                    clearTimeout(timeoutId);
                    break;
                }
                
                // 读取流式数据块
                const { done, value } = await reader.read();
                
                // 检查流是否结束
                if (done) {
                    console.log('Stream done, breaking');
                    clearTimeout(timeoutId);
                    break;
                }
                
                // 解码二进制数据为文本
                const chunk = decoder.decode(value, { stream: true });
                // 按行分割数据（SSE格式）
                const lines = chunk.split('\n');
                
                // 处理每一行数据
                for (const line of lines) {
                    // 检查是否为有效的SSE数据行
                    if (line.trim() && line.startsWith('data: ')) {
                        // 提取数据内容（去除"data: "前缀）
                        const data = line.slice(6).trim();
                        console.log('Received data:', JSON.stringify(data));
                        
                        // 检查是否为结束标记
                        if (data === '[DONE]') {
                            console.log('AI response completed - [DONE] received');
                            shouldBreak = true;
                            clearTimeout(timeoutId);
                            break;
                        }
                        
                        // 如果有有效数据，累积到回复内容中
                        if (data) {
                            botResponse += data;
                            // 实时更新UI显示最新的回复内容
                            setList(prev => {
                                const newList = [...prev];
                                // 更新最后一条消息（机器人回复）
                                newList[newList.length - 1] = {
                                    role: 'bot',
                                    content: botResponse
                                };
                                return newList;
                            });
                        }
                    }
                }
                
                // 再次检查是否需要退出循环
                if (shouldBreak) {
                    break;
                }
            }
        } catch (error) {
            console.error('Chat error:', error);
            if (error.name === 'AbortError') {
                console.log('Request was aborted due to timeout');
                Toast.show({
                    content: '请求超时，已自动取消',
                    duration: 2000
                })
            } else {
                Toast.show({
                    content: '网络错误，请稍后重试',
                    duration: 2000
                })
            }
        } finally {
            console.log('Finally block executed, setting disabled to false');
            setDisabled(false);
        }
    }

    return (
        <div className={styles['chat']}>
            <div className={styles['chat-header']}>
                <div className={styles['header-back']}>
                    <SvgIcon iconName="icon-fanhui" />
                </div>
                <div className={styles['header-title']}>
                    AI小助手
                </div>
            </div>
            <div className={styles['chat-container']}>
                <div className={styles['bot']}>
                    你好，我是AI小助手，有什么我可以帮助你的吗？
                </div>

                <div className={styles['container-chat']}>
                    {
                        list.map((item, index) => {
                            if (item.role === 'user') {
                                return (
                                    <div className={styles['user']} key={index}>
                                        {item.content}
                                    </div>
                                )
                            } else {
                                return (
                                    <div className={styles['bot']} key={index}>
                                        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                                            {item.content}
                                        </ReactMarkdown>
                                    </div>
                                )
                            }
                        })
                    }
                </div>

            </div>
            <div className={styles['chat-footer']}>
                <div className={styles['footer-input']}>
                    <input type="text" placeholder='请输入' ref={inputRef} />
                    <button onClick={send} disabled={disabled}>发送</button>
                </div>
            </div>
        </div>
    )
}
