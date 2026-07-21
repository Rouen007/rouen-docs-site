export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  // 定义哪些路径需要密码保护（默认锁住整个交易频道）
  const protectedPaths = [
    '/trading/'
  ];

  // 检查当前访问的 URL 是否在保护名单里
  const isProtected = protectedPaths.some(path => url.pathname.startsWith(path));

  if (isProtected) {
    const authHeader = request.headers.get('Authorization');
    
    // 默认账号密码：admin / admin888 (你可以随时告诉我修改)
    const expectedAuth = `Basic ${btoa('admin:admin888')}`;

    if (!authHeader || authHeader !== expectedAuth) {
      // 密码错误或未输入密码，弹出原生认证框
      return new Response('Unauthorized - 需要输入访问密码', {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic realm="Restricted Area - Trading Knowledge Base"',
        },
      });
    }
  }

  // 密码正确，或者访问的是非保护页面，直接放行
  return context.next();
}
