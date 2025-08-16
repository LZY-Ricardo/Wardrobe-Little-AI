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
    const send = async () => {
        const input = inputRef.current.value
        if (!input) {
            Toast.show({
                content: '请输入内容'
            })
            return
        }
        try {
            setList(prev => [...prev, {
                role: 'user',
                content: input
            }])

            const token = localStorage.getItem('access_token');
            const response = await fetch(`http://localhost:3000/chat?message=${encodeURIComponent(input)}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let botResponse = '';
            let isFirstChunk = true;
            
            // 添加初始的机器人消息
            setList(prev => [...prev, {
                role: 'bot',
                content: ''
            }]);
            
            while (true) {
                const { done, value } = await reader.read();
                
                if (done) {
                    setDisabled(false);
                    break;
                }
                
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');
                
                for (const line of lines) {
                    if (line.trim() && line.startsWith('data: ')) {
                        const data = line.slice(6).trim();
                        if (data === '[DONE]') {
                            setDisabled(false);
                            return;
                        }
                        
                        if (data) {
                            botResponse += data;
                            setList(prev => {
                                const newList = [...prev];
                                newList[newList.length - 1] = {
                                    role: 'bot',
                                    content: botResponse
                                };
                                return newList;
                            });
                        }
                    }
                }
            }
        } catch (error) {
            Toast.show({
                content: '网络错误，请稍后重试',
                duration: 2000
            })
        } finally {
            inputRef.current.value = ''
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
                    <button onClick={() => {
                        setDisabled(true);
                        send();
                    }} disabled={disabled}>发送</button>
                </div>
            </div>
        </div>
    )
}
