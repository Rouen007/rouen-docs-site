import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "Rouen's Base",
  description: "Trading, Tech, and Life notes",
  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '交易 📈', link: '/trading/' },
      { text: '技术 💻', link: '/tech/' },
      { text: '生活 ☕', link: '/life/' },
      { text: '关于我 👤', link: '/about' }
    ],
    
    sidebar: {
      // 当位于 /trading/ 目录下时，显示交易专用的侧边栏
      '/trading/': [
        {
          text: '导读',
          items: [
            { text: '交易主页', link: '/trading/' }
          ]
        },
        {
          text: '专题研究',
          items: [
            { text: 'Heatmap 五层框架', link: '/trading/heatmap/five-layer' }
          ]
        }
      ],
      // 当位于 /tech/ 目录下时，显示技术专用的侧边栏
      '/tech/': [
        {
          text: '导读',
          items: [
            { text: '技术主页', link: '/tech/' }
          ]
        },
        {
          text: 'C++ 学习地图',
          items: [
            { text: '现代 C++ 与游戏引擎基础', link: '/tech/cpp-engine-foundations' }
          ]
        },
        {
          text: 'C++ 基础篇章',
          items: [
            { text: '1. 生命周期、RAII 与所有权', link: '/tech/cpp/lifetime-raii-ownership' },
            { text: '2. 复制、移动与 noexcept', link: '/tech/cpp/copy-move-noexcept' },
            { text: '3. 对象模型与多态', link: '/tech/cpp/object-model-polymorphism' }
          ]
        }
      ],
      // 当位于 /life/ 目录下时，显示生活专用的侧边栏
      '/life/': [
        {
          text: '随笔',
          items: [
            { text: '生活主页', link: '/life/' }
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/Rouen007/rouen-docs-site' }
    ]
  }
})
