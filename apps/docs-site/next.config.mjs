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
})
