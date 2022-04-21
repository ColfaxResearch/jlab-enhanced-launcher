import { LabIcon } from '@jupyterlab/ui-components';

import mostUsedSvg from '../style/icons/grade.svg';
import viewListSvg from '../style/icons/view_list.svg';
import viewModuleSvg from '../style/icons/view_module.svg';
import blueDirectorySvg from '../style/icons/blue_directory_icon.svg';
import terminalSvg from '../style/icons/terminal.svg';

export const mostUsedIcon = new LabIcon({
  name: 'enhLauncher:most-used',
  svgstr: mostUsedSvg
});
export const viewListIcon = new LabIcon({
  name: 'enhLauncher:list',
  svgstr: viewListSvg
});
export const viewModuleIcon = new LabIcon({
  name: 'enhLauncher:module',
  svgstr: viewModuleSvg
});

export const bludDirectoryIcon = new LabIcon({
  name: 'directory:icon',
  svgstr: blueDirectorySvg
});

export const terminalIcon = new LabIcon({
  name: 'terminal:icon',
  svgstr: terminalSvg
});
