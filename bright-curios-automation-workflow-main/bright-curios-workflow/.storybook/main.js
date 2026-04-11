module.exports = {
    stories: ["../src/components/**/*.stories.@(ts|tsx|js|jsx)"],
    addons: [
        "@storybook/addon-essentials",
        "@storybook/addon-links",
        "@storybook/addon-interactions",
    ],
    framework: "@storybook/react",
    typescript: {
        reactDocgen: "react-docgen-typescript",
    },
};
