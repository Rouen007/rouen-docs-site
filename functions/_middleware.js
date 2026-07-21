export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  // 只锁交易频道
  const protectedPaths = ['/trading/'];
  const isProtected = protectedPaths.some(path => url.pathname.startsWith(path));

  if (!isProtected) {
    return context.next();
  }

  // 检查是否已经登录（通过 Cookie 判断）
  const cookie = request.headers.get('Cookie') || '';
  if (cookie.includes('auth=666666')) {
    return context.next(); // 密码正确，放行
  }

  // 处理提交密码的 POST 请求
  if (request.method === 'POST') {
    const formData = await request.formData();
    const password = formData.get('password');
    
    if (password === '666666') {
      // 密码正确，种下 Cookie 并重定向回当前页面
      return new Response('登录成功，正在跳转...', {
        status: 302,
        headers: {
          'Location': url.pathname,
          'Set-Cookie': 'auth=666666; Path=/; HttpOnly; Max-Age=2592000', // Cookie 保持 30 天
        },
      });
    }
  }

  // 如果没有登录，或者密码错误，则返回一个美化的单密码输入页面
  const html = `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="utf-8">
      <title>加密频道 - 访问受限</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { 
          font-family: 'Inter', system-ui, -apple-system, sans-serif; 
          display: flex; 
          justify-content: center; 
          align-items: center; 
          height: 100vh; 
          margin: 0; 
          background-color: #1e1e20; /* 适配你网站的暗色背景 */
          color: #rgba(255, 255, 255, 0.87); 
        }
        .login-box { 
          background: #252529; 
          padding: 2.5rem 2rem; 
          border-radius: 12px; 
          box-shadow: 0 8px 16px rgba(0,0,0,0.5); 
          text-align: center; 
          border: 1px solid #333;
        }
        h2 { margin-top: 0; color: #f6f6f7; font-size: 1.5rem; }
        p { color: #ebebf599; font-size: 0.9rem; margin-bottom: 2rem; }
        input { 
          padding: 12px; 
          margin: 10px 0; 
          border-radius: 6px; 
          border: 1px solid #444; 
          background: #1e1e20; 
          color: white; 
          width: 220px; 
          font-size: 1rem;
          text-align: center;
          outline: none;
        }
        input:focus { border-color: #7948f6; }
        button { 
          margin-top: 15px;
          padding: 12px 24px; 
          background: #7948f6; /* 你的神速紫 */
          color: white; 
          border: none; 
          border-radius: 6px; 
          cursor: pointer; 
          font-size: 1rem;
          font-weight: bold;
          width: 100%;
          transition: background 0.2s;
        }
        button:hover { background: #6038c7; }
        .error { color: #f44336; font-size: 0.85rem; margin-top: 10px; display: block; }
      </style>
    </head>
    <body>
      <div class="login-box">
        <h2>🔒 交易知识库</h2>
        <p>该频道已被设为私密，请输入访问密码</p>
        <form method="POST">
          <input type="password" name="password" placeholder="输入密码" autofocus required>
          ${request.method === 'POST' ? '<span class="error">密码错误，请重试</span>' : ''}
          <br>
          <button type="submit">解锁进入</button>
        </form>
      </div>
    </body>
    </html>
  `;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html;charset=UTF-8' },
  });
}
