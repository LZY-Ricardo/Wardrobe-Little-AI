## ADDED Requirements

### Requirement: LLM 场景推荐仅使用衣柜服饰
后端 MUST 基于用户衣柜与场景描述调用本地 LLM 生成 3-5 套推荐，输出 JSON 且仅包含现有 `cloth_id`。

#### Scenario: 生成场景搭配
- **WHEN** 用户提交场景（如“商务”）且衣柜存在可用衣物
- **THEN** 系统调用本地 LLM 返回 3-5 套 JSON，每套包含 scene、reason、items (cloth_id 列表)，不包含未提供的衣物

### Requirement: LLM 不可用时规则降级
当 LLM 超时、异常或输出不可解析时，系统 MUST 自动切换规则算法生成推荐并返回成功响应。

#### Scenario: LLM 超时降级
- **WHEN** LLM 调用超时或解析失败
- **THEN** 采用内置场景规则（type/季节/风格/颜色权重）生成最多 3-5 套，返回 code=1 并标记 source=rule

### Requirement: 推荐结果校验与过滤
推荐结果 MUST 过滤无效 `cloth_id`、限制字段长度与套数，并在数据不足时返回可用提示而非错误。

#### Scenario: 过滤无效衣物
- **WHEN** 推荐列表包含不存在的 cloth_id 或字段过长
- **THEN** 系统丢弃无效项、截断超长文案，若剩余套数为 0 则返回 code=1、data=[]、msg 提示用户补齐衣柜或更换场景

### Requirement: 接口契约与来源标记
接口响应 MUST 使用 `{code,data,msg?}`，包含推荐来源（模型或规则）与理由文案，前端无需区分失败。

#### Scenario: 响应包含来源
- **WHEN** 推荐生成完成（模型或规则）
- **THEN** 返回数据项包含 source (llm|rule) 与 reason/description 字段，code=1，错误仅在系统异常时返回 code=0、msg***
