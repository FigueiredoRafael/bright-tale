import nextra from 'nextra'

const withNextra = nextra({
  contentDirBasePath: '/',
  defaultShowCopyCode: true,
  search: {
    codeblocks: true,
  },
})

export default withNextra({
  reactStrictMode: true,
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = false
    }
    return config
  },
})
