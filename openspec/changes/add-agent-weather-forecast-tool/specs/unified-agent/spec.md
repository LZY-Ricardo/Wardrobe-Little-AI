## ADDED Requirements

### Requirement: unified-agent MUST 可调用天气只读工具获取真实天气
unified-agent MUST 向 LLM 暴露天气只读工具，使其能够在用户询问天气或需要基于天气提供穿搭建议时，读取指定城市或指定日期的真实天气数据，并基于工具结果继续组织最终回复。

#### Scenario: 用户询问指定城市指定日期天气
- **WHEN** 用户在 unified-agent 中询问“明天上海天气怎么样”
- **THEN** LLM 可以调用天气工具读取对应天气数据，并基于工具结果继续输出自然语言答复，而不是仅给出“无法查询实时天气”的兜底话术

#### Scenario: 天气工具返回真实结果后继续回复
- **WHEN** 天气工具执行成功并返回城市、日期与温度范围
- **THEN** unified-agent 应继续由主对话模型生成最终答复，不直接把工具原始 JSON 作为最终消息展示给用户
