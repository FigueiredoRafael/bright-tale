import React from 'react';
import ProjectCreationModal from './ProjectCreationModal';
import { Meta, StoryFn } from '@storybook/react';
import fixture from '../../../../test/fixtures/ai/discovery-multiple.json';

export default {
    title: 'Projects/ProjectCreationModal',
    component: ProjectCreationModal,
} as Meta;

const Template: StoryFn = (args) => (
    <div style={{ width: 1200 }}>
        <ProjectCreationModal {...args} />
    </div>
);

export const Default = Template.bind({});
Default.args = { open: true, onOpenChange: (v) => console.log('open', v), selectedIdeas: fixture.ideas.slice(0, 2) };
