import React from 'react';
import IdeaSelectionGrid from './IdeaSelectionGrid';
import { Meta, StoryFn } from '@storybook/react';
import fixture from '../../../../test/fixtures/ai/discovery-multiple.json';

export default {
    title: 'Discovery/IdeaSelectionGrid',
    component: IdeaSelectionGrid,
} as Meta;

const Template: StoryFn = (args) => <div style={{ width: 1000 }}><IdeaSelectionGrid {...args} /></div>;

export const WithIdeas = Template.bind({});
WithIdeas.args = { ideas: fixture.ideas };
