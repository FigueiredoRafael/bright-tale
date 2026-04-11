import React from 'react';
import DiscoveryFormBuilder from './DiscoveryFormBuilder';
import { Meta, StoryFn } from '@storybook/react';

export default {
    title: 'Discovery/DiscoveryFormBuilder',
    component: DiscoveryFormBuilder,
} as Meta;

const Template: StoryFn = (args) => <div style={{ width: 900 }}><DiscoveryFormBuilder {...args} /></div>;

export const Default = Template.bind({});
Default.args = {};
