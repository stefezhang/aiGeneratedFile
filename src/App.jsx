import { useEffect, useRef, useState } from "react";

const MENU_ORDER_KEY = "menu_items_order_v1";
const baseMenuItems = [
  {
    key: "create-table",
    label: "生成建表语句",
    desc: "根据业务描述生成建表 SQL",
    icon: "🧱",
    badge: "DATA MODEL",
    gradient: "menu-card-cyan"
  },
  {
    key: "generate-code",
    label: "生成代码",
    desc: "根据需求生成可运行代码逻辑",
    icon: "⚙️",
    badge: "CODE GEN",
    gradient: "menu-card-purple"
  },
  {
    key: "generate-requirement-doc",
    label: "生成需求文档",
    desc: "根据需求生成可下载的需求文档",
    icon: "📝",
    badge: "DOC MAKER",
    gradient: "menu-card-emerald"
  },
  {
    key: "generate-deploy-plan",
    label: "生成部署方案",
    desc: "按技术栈生成可导出的部署方案",
    icon: "🚀",
    badge: "DEPLOY PLAN",
    gradient: "menu-card-amber"
  }
];
const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 20000;
const DOC_REQUEST_TIMEOUT_MS = 90000;
const MAX_RETRIES = 2;
const PARTICLES = Array.from({ length: 20 }, (_, i) => ({
  id: i,
  left: `${(i * 5) % 100}%`,
  size: 2 + (i % 4),
  delay: `${(i % 7) * 0.7}s`,
  duration: `${6 + (i % 5)}s`
}));
const RAIN_COLUMNS = Array.from({ length: 14 }, (_, i) => ({
  id: i,
  left: `${i * 7}%`,
  delay: `${(i % 6) * 0.6}s`,
  duration: `${4 + (i % 4)}s`,
  chars: i % 2 === 0 ? "010101AI" : "SQL1100"
}));

export default function App() {
  const [activeMenu, setActiveMenu] = useState("home");
  const [apiKey, setApiKey] = useState(localStorage.getItem("deepseek_api_key") || "");
  const [businessDesc, setBusinessDesc] = useState("");
  const [tableName, setTableName] = useState("");
  const [columnsHint, setColumnsHint] = useState("");
  const [engineHint, setEngineHint] = useState("InnoDB");
  const [dbType, setDbType] = useState("mysql");
  const [loading, setLoading] = useState(false);
  const [sqlResult, setSqlResult] = useState("");
  const [codeRequirement, setCodeRequirement] = useState("");
  const [codeLanguage, setCodeLanguage] = useState("java");
  const [codeResult, setCodeResult] = useState("");
  const [docRequirement, setDocRequirement] = useState("");
  const [docResult, setDocResult] = useState("");
  const [docTitle, setDocTitle] = useState("需求文档");
  const [docExportFormat, setDocExportFormat] = useState("docx");
  const [deployTab, setDeployTab] = useState("frontend");
  const [frontendFramework, setFrontendFramework] = useState("react");
  const [frontendDeployRequirement, setFrontendDeployRequirement] = useState("");
  const [frontendDeployResult, setFrontendDeployResult] = useState("");
  const [backendLanguage, setBackendLanguage] = useState("java");
  const [backendDeployRequirement, setBackendDeployRequirement] = useState("");
  const [backendDeployResult, setBackendDeployResult] = useState("");
  const [error, setError] = useState("");
  const [sqlCopyTip, setSqlCopyTip] = useState("");
  const [codeCopyTip, setCodeCopyTip] = useState("");
  const [apiKeyTip, setApiKeyTip] = useState("");
  const [historyList, setHistoryList] = useState([]);
  const [menuItems, setMenuItems] = useState(() => {
    const raw = localStorage.getItem(MENU_ORDER_KEY);
    if (!raw) return baseMenuItems;
    try {
      const savedKeys = JSON.parse(raw);
      if (!Array.isArray(savedKeys)) return baseMenuItems;
      const map = new Map(baseMenuItems.map((m) => [m.key, m]));
      const ordered = savedKeys.filter((k) => map.has(k)).map((k) => map.get(k));
      const rest = baseMenuItems.filter((m) => !savedKeys.includes(m.key));
      return [...ordered, ...rest];
    } catch {
      return baseMenuItems;
    }
  });
  const [draggingKey, setDraggingKey] = useState(null);
  const draggingKeyRef = useRef(null);
  const lastDropAtRef = useRef(0);

  useEffect(() => {
    localStorage.setItem(MENU_ORDER_KEY, JSON.stringify(menuItems.map((m) => m.key)));
  }, [menuItems]);

  const callDeepSeekWithRetry = async (payload, timeoutMs = REQUEST_TIMEOUT_MS) => {
    let lastError = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(DEEPSEEK_API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey.trim()}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error?.message || "DeepSeek 调用失败。");
        }

        clearTimeout(timeoutId);
        return data;
      } catch (requestError) {
        clearTimeout(timeoutId);
        lastError = requestError;

        if (attempt >= MAX_RETRIES) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }

    throw lastError || new Error("DeepSeek 调用失败。");
  };

  const handleGenerateSQL = async (event) => {
    event.preventDefault();
    setError("");
    setSqlResult("");
    setSqlCopyTip("");

    if (!businessDesc.trim()) {
      setError("请先输入业务描述。");
      return;
    }
    if (!apiKey.trim()) {
      setError("请先输入 DeepSeek API Key。");
      return;
    }

    setLoading(true);
    try {
      const prompt = `
你是一位数据库架构专家，请根据下面输入生成 ${dbType.toUpperCase()} 建表语句，仅返回 SQL，不要解释。

业务描述:
${businessDesc}

表名（可选）:
${tableName || "未指定"}

字段补充说明（可选）:
${columnsHint || "无"}

存储引擎（可选）:
${engineHint || "InnoDB"}

要求:
1. 生成完整 CREATE TABLE 语句
2. 包含主键、必要索引、注释、默认值
3. 字段命名清晰，类型合理
4. 使用 utf8mb4 字符集
`.trim();

      const data = await callDeepSeekWithRetry({
        model: "deepseek-chat",
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content: "你是 SQL DDL 生成助手。"
          },
          {
            role: "user",
            content: prompt
          }
        ]
      });
      const nextSql = data?.choices?.[0]?.message?.content || "";
      setSqlResult(nextSql);
      setHistoryList((prev) => [
        {
          id: Date.now(),
          businessDesc: businessDesc.trim(),
          tableName: tableName.trim() || "未指定",
          dbType: dbType.toUpperCase(),
          sql: nextSql
        },
        ...prev
      ]);
    } catch (requestError) {
      const isTimeoutError = requestError?.name === "AbortError";
      setError(isTimeoutError ? "请求超时，请重试。" : requestError.message || "请求失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  };

  const handleCopySql = async () => {
    if (!sqlResult) {
      setSqlCopyTip("暂无可复制 SQL");
      return;
    }

    try {
      await navigator.clipboard.writeText(sqlResult);
      setSqlCopyTip("复制成功");
    } catch (clipboardError) {
      setSqlCopyTip("复制失败，请手动复制");
    }
  };

  const handleGenerateCode = async (event) => {
    event.preventDefault();
    setError("");
    setCodeResult("");
    setCodeCopyTip("");

    if (!codeRequirement.trim()) {
      setError("请先输入代码需求。");
      return;
    }
    if (!apiKey.trim()) {
      setError("请先输入 DeepSeek API Key。");
      return;
    }

    setLoading(true);
    try {
      const languageLabel = codeLanguage === "cpp" ? "C++" : codeLanguage;
      const prompt = `
你是一位资深软件工程师。请根据以下需求，生成 ${languageLabel} 代码，仅返回代码，不要额外解释。

需求描述:
${codeRequirement}

要求:
1. 代码结构清晰，包含关键逻辑
2. 使用 ${languageLabel} 的常见最佳实践
3. 可以直接复制使用
`.trim();

      const data = await callDeepSeekWithRetry({
        model: "deepseek-chat",
        temperature: 0.2,
        messages: [
          { role: "system", content: "你是代码生成助手。" },
          { role: "user", content: prompt }
        ]
      });
      const nextCode = data?.choices?.[0]?.message?.content || "";
      setCodeResult(nextCode);
    } catch (requestError) {
      const isTimeoutError = requestError?.name === "AbortError";
      setError(isTimeoutError ? "请求超时，请重试。" : requestError.message || "请求失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = async () => {
    if (!codeResult) {
      setCodeCopyTip("暂无可复制代码");
      return;
    }

    try {
      await navigator.clipboard.writeText(codeResult);
      setCodeCopyTip("复制成功");
    } catch (clipboardError) {
      setCodeCopyTip("复制失败，请手动复制");
    }
  };

  const handleGenerateRequirementDoc = async (event) => {
    event.preventDefault();
    setError("");
    setDocResult("");

    if (!docRequirement.trim()) {
      setError("请先输入需求描述。");
      return;
    }
    if (!apiKey.trim()) {
      setError("请先输入 DeepSeek API Key。");
      return;
    }

    setLoading(true);
    try {
      const prompt = `
你是一名资深产品经理，请根据下面需求生成一份结构化需求文档，仅返回文档正文内容（纯文本格式）。

需求输入:
${docRequirement}

输出要求:
1. 包含：文档概述、背景与目标、用户角色、功能需求、非功能需求、业务流程、验收标准、里程碑
2. 每个章节内容清晰、可执行
3. 用中文输出
`.trim();

      const data = await callDeepSeekWithRetry({
        model: "deepseek-chat",
        temperature: 0.2,
        messages: [
          { role: "system", content: "你是需求文档生成助手。" },
          { role: "user", content: prompt }
        ]
      }, DOC_REQUEST_TIMEOUT_MS);

      const nextDoc = data?.choices?.[0]?.message?.content || "";
      setDocResult(nextDoc);
    } catch (requestError) {
      const isTimeoutError = requestError?.name === "AbortError";
      setError(isTimeoutError ? "请求超时，请重试。" : requestError.message || "请求失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadDocument = async () => {
    if (!docResult.trim()) {
      setError("暂无可下载的需求文档内容。");
      return;
    }

    const safeTitle = (docTitle || "需求文档").replace(/[\\/:*?"<>|]/g, "_");
    if (docExportFormat === "md") {
      const markdownContent = `# ${safeTitle}\n\n${docResult}`;
      const mdBlob = new Blob([markdownContent], { type: "text/markdown;charset=utf-8" });
      const mdUrl = URL.createObjectURL(mdBlob);
      const mdLink = document.createElement("a");
      mdLink.href = mdUrl;
      mdLink.download = `${safeTitle}.md`;
      document.body.appendChild(mdLink);
      mdLink.click();
      mdLink.remove();
      URL.revokeObjectURL(mdUrl);
      return;
    }

    const { Document, HeadingLevel, Packer, Paragraph, TextRun } = await import("docx");

    const paragraphs = docResult
      .split("\n")
      .map((line) => line.trim())
      .filter((line, index, arr) => line.length > 0 || (index > 0 && arr[index - 1].length > 0))
      .map((line) =>
        new Paragraph({
          children: [new TextRun(line || " ")],
          spacing: { after: 180 }
        })
      );

    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              text: safeTitle,
              heading: HeadingLevel.TITLE
            }),
            ...paragraphs
          ]
        }
      ]
    });
    const buffer = await Packer.toBlob(doc);
    const docxUrl = URL.createObjectURL(buffer);
    const docxLink = document.createElement("a");
    docxLink.href = docxUrl;
    docxLink.download = `${safeTitle}.docx`;
    document.body.appendChild(docxLink);
    docxLink.click();
    docxLink.remove();
    URL.revokeObjectURL(docxUrl);
  };

  const handleGenerateFrontendDeployPlan = async (event) => {
    event.preventDefault();
    setError("");
    setFrontendDeployResult("");
    if (!apiKey.trim()) {
      setError("请先输入 DeepSeek API Key。");
      return;
    }
    if (!frontendDeployRequirement.trim()) {
      setError("请先输入前端部署需求。");
      return;
    }

    setLoading(true);
    try {
      const frameworkLabel = frontendFramework === "react" ? "React" : "Vue";
      const prompt = `
你是一位 DevOps 架构师。请基于 ${frameworkLabel} 项目生成完整部署方案，仅返回中文正文内容。

项目需求:
${frontendDeployRequirement}

输出必须包含:
1. 部署架构（开发/测试/生产）
2. 构建与打包步骤
3. Nginx 或静态托管配置建议
4. CI/CD 建议
5. 监控与回滚方案
6. 风险与注意事项
`.trim();

      const data = await callDeepSeekWithRetry({
        model: "deepseek-chat",
        temperature: 0.2,
        messages: [
          { role: "system", content: "你是前端部署方案生成助手。" },
          { role: "user", content: prompt }
        ]
      });
      setFrontendDeployResult(data?.choices?.[0]?.message?.content || "");
    } catch (requestError) {
      const isTimeoutError = requestError?.name === "AbortError";
      setError(isTimeoutError ? "请求超时，请重试。" : requestError.message || "请求失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateBackendDeployPlan = async (event) => {
    event.preventDefault();
    setError("");
    setBackendDeployResult("");
    if (!apiKey.trim()) {
      setError("请先输入 DeepSeek API Key。");
      return;
    }
    if (!backendDeployRequirement.trim()) {
      setError("请先输入后端部署需求。");
      return;
    }

    setLoading(true);
    try {
      const languageMap = {
        java: "Java",
        cpp: "C++",
        python: "Python",
        go: "Go"
      };
      const languageLabel = languageMap[backendLanguage] || backendLanguage;
      const prompt = `
你是一位 DevOps 架构师。请基于 ${languageLabel} 服务生成完整部署方案，仅返回中文正文内容。

项目需求:
${backendDeployRequirement}

输出必须包含:
1. 部署架构（单机/集群）
2. 构建与发布步骤
3. 运行环境要求
4. 容器化与编排建议（Docker/K8s）
5. CI/CD 建议
6. 监控、日志、告警与回滚方案
`.trim();

      const data = await callDeepSeekWithRetry({
        model: "deepseek-chat",
        temperature: 0.2,
        messages: [
          { role: "system", content: "你是后端部署方案生成助手。" },
          { role: "user", content: prompt }
        ]
      });
      setBackendDeployResult(data?.choices?.[0]?.message?.content || "");
    } catch (requestError) {
      const isTimeoutError = requestError?.name === "AbortError";
      setError(isTimeoutError ? "请求超时，请重试。" : requestError.message || "请求失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  };

  const downloadPlanText = (title, content) => {
    if (!content.trim()) {
      setError("暂无可导出的部署方案。");
      return;
    }
    const safeTitle = title.replace(/[\\/:*?"<>|]/g, "_");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeTitle}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };
  const backendLanguageLabelMap = {
    java: "Java",
    cpp: "C++",
    python: "Python",
    go: "Go"
  };

  const handleUseHistory = (item) => {
    setSqlResult(item.sql);
    setBusinessDesc(item.businessDesc);
    setTableName(item.tableName === "未指定" ? "" : item.tableName);
    setDbType(item.dbType.toLowerCase());
    setSqlCopyTip("");
  };

  const handleSaveApiKey = () => {
    if (!apiKey.trim()) {
      localStorage.removeItem("deepseek_api_key");
      setApiKeyTip("已清空本地 API Key");
      return;
    }
    localStorage.setItem("deepseek_api_key", apiKey.trim());
    setApiKeyTip("API Key 已保存到浏览器本地");
  };

  const selectMenu = (key) => {
    // 防止拖拽结束后的 click 误触发切换
    if (Date.now() - lastDropAtRef.current < 300) return;
    setActiveMenu(key);
  };

  const handleDragStart = (key) => {
    draggingKeyRef.current = key;
    setDraggingKey(key);
  };

  const handleDragEnd = () => {
    draggingKeyRef.current = null;
    setDraggingKey(null);
  };

  const handleDragOver = (event) => {
    // 必须阻止默认行为，才能允许 drop
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (targetKey) => (event) => {
    event.preventDefault();
    const sourceKey = draggingKeyRef.current;
    draggingKeyRef.current = null;
    setDraggingKey(null);

    if (!sourceKey || sourceKey === targetKey) return;

    setMenuItems((prev) => {
      const fromIndex = prev.findIndex((m) => m.key === sourceKey);
      const toIndex = prev.findIndex((m) => m.key === targetKey);
      if (fromIndex < 0 || toIndex < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });

    lastDropAtRef.current = Date.now();
  };

  return (
    <div className="layout">
      {activeMenu !== "home" && (
        <aside className="sidebar">
          <div className="sidebar-title">功能菜单</div>
          <button type="button" className="menu-item" onClick={() => setActiveMenu("home")}>
            返回首页
          </button>
          {menuItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`menu-item ${activeMenu === item.key ? "active" : ""}`}
              draggable
              onDragStart={() => handleDragStart(item.key)}
              onDragOver={handleDragOver}
              onDrop={handleDrop(item.key)}
              onDragEnd={handleDragEnd}
              aria-grabbed={draggingKey === item.key}
              onClick={() => selectMenu(item.key)}
              title="拖拽可调整顺序"
            >
              {item.label}
            </button>
          ))}
        </aside>
      )}

      <main className="main">
        {activeMenu === "home" && (
          <section className="home-panel">
            <div className="scan-line" />
            <div className="home-glow" />
            <div className="home-border-glow" />
            <div className="particle-layer">
              {PARTICLES.map((particle) => (
                <span
                  key={particle.id}
                  className="particle"
                  style={{
                    left: particle.left,
                    width: `${particle.size}px`,
                    height: `${particle.size}px`,
                    animationDelay: particle.delay,
                    animationDuration: particle.duration
                  }}
                />
              ))}
            </div>
            <div className="matrix-rain">
              {RAIN_COLUMNS.map((column) => (
                <span
                  key={column.id}
                  style={{
                    left: column.left,
                    animationDelay: column.delay,
                    animationDuration: column.duration
                  }}
                >
                  {column.chars}
                </span>
              ))}
            </div>
            <div className="home-content">
              <p className="badge">AI POWERED ENGINE FOR DEVELOPER</p>
              <h1>智能开发平台</h1>
              <p className="typing-text">DeepSeek Cognitive Core: online and ready.</p>
              <p className="home-desc">
                deepSeek+cursor 智能开发平台。
              </p>
              <div className="home-menu-grid">
                {menuItems.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    draggable
                    className={`home-menu-card ${item.gradient} ${draggingKey === item.key ? "dragging-card" : ""}`}
                    onDragStart={() => handleDragStart(item.key)}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop(item.key)}
                    onDragEnd={handleDragEnd}
                    onClick={() => selectMenu(item.key)}
                  >
                    <div className="home-menu-top">
                      <span className="home-menu-icon">{item.icon}</span>
                      <span className="home-menu-badge">{item.badge}</span>
                    </div>
                    <strong>{item.label}</strong>
                    <span>{item.desc}</span>
                    <em>点击进入</em>
                  </button>
                ))}
              </div>

              <div className="feature-grid">
                <article className="feature-card">
                  <h3>语义理解建模</h3>
                  <p>自动解析业务描述，推导字段类型、索引与默认值策略。</p>
                </article>
                <article className="feature-card">
                  <h3>多数据库适配</h3>
                  <p>支持 MySQL / PostgreSQL，一次输入快速切换输出格式。</p>
                </article>
                <article className="feature-card">
                  <h3>AI 稳定生成</h3>
                  <p>内置超时与重试机制，降低接口波动造成的失败率。</p>
                </article>
                <article className="feature-card">
                  <h3>工程化效率</h3>
                  <p>历史记录可回放复用，配合一键复制直达开发流程。</p>
                </article>
              </div>
            </div>
          </section>
        )}

        {activeMenu === "create-table" && (
          <section className="panel">
            <h1>生成建表语句</h1>
            <p className="hint">输入业务需求后，系统会调用 DeepSeek 生成对应数据库的建表语句。</p>

            <form className="form" onSubmit={handleGenerateSQL}>
              <label>
                DeepSeek API Key（前端直连）
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                />
              </label>
              <button type="button" className="secondary-btn" onClick={handleSaveApiKey}>
                保存 API Key 到本地
              </button>
              {apiKeyTip && <div className="copy-tip">{apiKeyTip}</div>}

              <label>
                数据库类型
                <select value={dbType} onChange={(e) => setDbType(e.target.value)}>
                  <option value="mysql">MySQL</option>
                  <option value="postgresql">PostgreSQL</option>
                </select>
              </label>

              <label>
                业务描述（必填）
                <textarea
                  rows={4}
                  value={businessDesc}
                  onChange={(e) => setBusinessDesc(e.target.value)}
                  placeholder="例如：用户表，包含用户名、手机号、状态、创建时间等字段"
                />
              </label>

              <label>
                表名（可选）
                <input
                  type="text"
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  placeholder="例如：user_info"
                />
              </label>

              <label>
                字段补充说明（可选）
                <input
                  type="text"
                  value={columnsHint}
                  onChange={(e) => setColumnsHint(e.target.value)}
                  placeholder="例如：手机号唯一索引，状态默认为1"
                />
              </label>

              <label>
                存储引擎（可选）
                <input
                  type="text"
                  value={engineHint}
                  onChange={(e) => setEngineHint(e.target.value)}
                  placeholder="默认 InnoDB"
                />
              </label>

              <button type="submit" disabled={loading}>
                {loading ? "正在生成..." : "生成 SQL"}
              </button>
            </form>

            {error && <div className="error">{error}</div>}

            <div className="result-card">
              <div className="result-header">
                <h2>生成结果</h2>
                <button type="button" className="copy-btn" onClick={handleCopySql}>
                  复制 SQL
                </button>
              </div>
              {sqlCopyTip && <div className="copy-tip">{sqlCopyTip}</div>}
              <pre>{sqlResult || "这里会显示 DeepSeek 返回的建表 SQL。"}</pre>
            </div>

            <div className="history-card">
              <h2>生成历史</h2>
              {historyList.length === 0 ? (
                <p className="history-empty">暂无历史记录。</p>
              ) : (
                <ul className="history-list">
                  {historyList.map((item) => (
                    <li key={item.id} className="history-item">
                      <div className="history-meta">
                        <span>{item.dbType}</span>
                        <span>{item.tableName}</span>
                      </div>
                      <p>{item.businessDesc}</p>
                      <button type="button" onClick={() => handleUseHistory(item)}>
                        查看并复用
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        {activeMenu === "generate-code" && (
          <section className="panel">
            <h1>生成代码</h1>
            <p className="hint">输入需求后，系统会调用 DeepSeek 生成指定语言的代码逻辑。</p>

            <form className="form" onSubmit={handleGenerateCode}>
              <label>
                DeepSeek API Key（前端直连）
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                />
              </label>
              <button type="button" className="secondary-btn" onClick={handleSaveApiKey}>
                保存 API Key 到本地
              </button>
              {apiKeyTip && <div className="copy-tip">{apiKeyTip}</div>}

              <label>
                编程语言
                <select value={codeLanguage} onChange={(e) => setCodeLanguage(e.target.value)}>
                  <option value="java">Java</option>
                  <option value="cpp">C++</option>
                  <option value="python">Python</option>
                </select>
              </label>

              <label>
                需求描述（必填）
                <textarea
                  rows={5}
                  value={codeRequirement}
                  onChange={(e) => setCodeRequirement(e.target.value)}
                  placeholder="例如：实现一个 LRU 缓存，支持 get/put，并给出简单示例"
                />
              </label>

              <button type="submit" disabled={loading}>
                {loading ? "正在生成..." : "生成代码"}
              </button>
            </form>

            {error && <div className="error">{error}</div>}

            <div className="result-card">
              <div className="result-header">
                <h2>生成结果</h2>
                <button type="button" className="copy-btn" onClick={handleCopyCode}>
                  复制代码
                </button>
              </div>
              {codeCopyTip && <div className="copy-tip">{codeCopyTip}</div>}
              <pre>{codeResult || "这里会显示 DeepSeek 返回的代码结果。"}</pre>
            </div>
          </section>
        )}

        {activeMenu === "generate-requirement-doc" && (
          <section className="panel">
            <h1>生成需求文档</h1>
            <p className="hint">输入需求后，系统会调用 DeepSeek 生成结构化需求文档，可一键下载为 Word。</p>

            <form className="form" onSubmit={handleGenerateRequirementDoc}>
              <label>
                DeepSeek API Key（前端直连）
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                />
              </label>
              <button type="button" className="secondary-btn" onClick={handleSaveApiKey}>
                保存 API Key 到本地
              </button>
              {apiKeyTip && <div className="copy-tip">{apiKeyTip}</div>}

              <label>
                文档标题
                <input
                  type="text"
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  placeholder="例如：智能客服系统需求文档"
                />
              </label>

              <label>
                导出格式
                <select value={docExportFormat} onChange={(e) => setDocExportFormat(e.target.value)}>
                  <option value="docx">DOCX</option>
                  <option value="md">Markdown</option>
                </select>
              </label>

              <label>
                需求描述（必填）
                <textarea
                  rows={6}
                  value={docRequirement}
                  onChange={(e) => setDocRequirement(e.target.value)}
                  placeholder="例如：需要一个企业内部工单系统，支持提单、指派、处理、统计分析..."
                />
              </label>

              <button type="submit" disabled={loading}>
                {loading ? "正在生成..." : "生成需求文档"}
              </button>
            </form>

            {error && <div className="error">{error}</div>}

            <div className="result-card doc-preview-card">
              <div className="result-header">
                <h2>文档预览</h2>
                <button type="button" className="copy-btn" onClick={handleDownloadDocument}>
                  下载 {docExportFormat.toUpperCase()}
                </button>
              </div>
              <article className="word-preview">
                <h3>{docTitle || "需求文档"}</h3>
                <div>{docResult || "这里会显示 DeepSeek 返回的需求文档内容。"}</div>
              </article>
            </div>
          </section>
        )}

        {activeMenu === "generate-deploy-plan" && (
          <section className="panel">
            <h1>生成部署方案</h1>
            <p className="hint">选择子菜单后，按技术栈生成部署方案并导出。</p>

            <div className="deploy-tabs">
              <button
                type="button"
                className={`deploy-tab ${deployTab === "frontend" ? "active" : ""}`}
                onClick={() => setDeployTab("frontend")}
              >
                生成前端部署方案
              </button>
              <button
                type="button"
                className={`deploy-tab ${deployTab === "backend" ? "active" : ""}`}
                onClick={() => setDeployTab("backend")}
              >
                生成后端部署方案
              </button>
            </div>

            {deployTab === "frontend" && (
              <>
                <form className="form" onSubmit={handleGenerateFrontendDeployPlan}>
                  <label>
                    DeepSeek API Key（前端直连）
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-..."
                    />
                  </label>
                  <button type="button" className="secondary-btn" onClick={handleSaveApiKey}>
                    保存 API Key 到本地
                  </button>
                  {apiKeyTip && <div className="copy-tip">{apiKeyTip}</div>}

                  <label>
                    前端框架
                    <select value={frontendFramework} onChange={(e) => setFrontendFramework(e.target.value)}>
                      <option value="react">React</option>
                      <option value="vue">Vue</option>
                    </select>
                  </label>

                  <label>
                    需求描述（必填）
                    <textarea
                      rows={5}
                      value={frontendDeployRequirement}
                      onChange={(e) => setFrontendDeployRequirement(e.target.value)}
                      placeholder="例如：需要部署 React 管理后台到生产环境，支持灰度发布和回滚"
                    />
                  </label>

                  <button type="submit" disabled={loading}>
                    {loading ? "正在生成..." : "生成前端部署方案"}
                  </button>
                </form>

                {error && <div className="error">{error}</div>}

                <div className="result-card doc-preview-card">
                  <div className="result-header">
                    <h2>前端部署方案</h2>
                    <button
                      type="button"
                      className="copy-btn"
                      onClick={() =>
                        downloadPlanText(
                          `${frontendFramework === "react" ? "React" : "Vue"}前端部署方案`,
                          frontendDeployResult
                        )
                      }
                    >
                      导出方案
                    </button>
                  </div>
                  <article className="word-preview">
                    <h3>{frontendFramework === "react" ? "React" : "Vue"} 前端部署方案</h3>
                    <div>{frontendDeployResult || "这里会显示前端部署方案内容。"}</div>
                  </article>
                </div>
              </>
            )}

            {deployTab === "backend" && (
              <>
                <form className="form" onSubmit={handleGenerateBackendDeployPlan}>
                  <label>
                    DeepSeek API Key（前端直连）
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-..."
                    />
                  </label>
                  <button type="button" className="secondary-btn" onClick={handleSaveApiKey}>
                    保存 API Key 到本地
                  </button>
                  {apiKeyTip && <div className="copy-tip">{apiKeyTip}</div>}

                  <label>
                    后端语言
                    <select value={backendLanguage} onChange={(e) => setBackendLanguage(e.target.value)}>
                      <option value="java">Java</option>
                      <option value="cpp">C++</option>
                      <option value="python">Python</option>
                      <option value="go">Go</option>
                    </select>
                  </label>

                  <label>
                    需求描述（必填）
                    <textarea
                      rows={5}
                      value={backendDeployRequirement}
                      onChange={(e) => setBackendDeployRequirement(e.target.value)}
                      placeholder="例如：Python FastAPI 服务部署到 K8s，支持水平扩缩容"
                    />
                  </label>

                  <button type="submit" disabled={loading}>
                    {loading ? "正在生成..." : "生成后端部署方案"}
                  </button>
                </form>

                {error && <div className="error">{error}</div>}

                <div className="result-card doc-preview-card">
                  <div className="result-header">
                    <h2>后端部署方案</h2>
                    <button
                      type="button"
                      className="copy-btn"
                      onClick={() =>
                        downloadPlanText(`${backendLanguageLabelMap[backendLanguage] || "后端"}部署方案`, backendDeployResult)
                      }
                    >
                      导出方案
                    </button>
                  </div>
                  <article className="word-preview">
                    <h3>{backendLanguageLabelMap[backendLanguage] || "后端"} 部署方案</h3>
                    <div>{backendDeployResult || "这里会显示后端部署方案内容。"}</div>
                  </article>
                </div>
              </>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
