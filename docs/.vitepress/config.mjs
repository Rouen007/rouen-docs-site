import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "Heatmap 五层框架",
  description: "Heatmap 五层框架重学与系统性总结",
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' }
    ],
    sidebar: [
      {
        text: '目录',
        items: [
          { text: '框架总览', link: '/' }
        ]
      }
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/Rouen007/heatmap-docs' }
    ]
  }
})
