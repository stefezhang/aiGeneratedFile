# DeepSeek SQL 建表语句生成系统

## 功能
- 左侧菜单固定为“生成建表语句”
- 右侧展示表单，用户输入业务需求
- 支持选择数据库类型（MySQL / PostgreSQL）
- 前端直连 DeepSeek 并返回 SQL 建表语句
- 支持一键复制 SQL
- 支持生成历史记录（可查看并复用）
- DeepSeek 调用带超时和自动重试（前端）

## 启动步骤
1. 安装依赖：
   - `npm install`
2. 启动前端：
   - `npm run dev`
3. 打开页面后，在页面中输入 DeepSeek API Key（可保存到浏览器本地）

前端默认地址：`http://localhost:5173`

## 注意事项
- 纯前端方案中，API Key 会存在浏览器侧，仅建议个人测试或内网使用。
