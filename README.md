# jlab-enhanced-launcher

[![Extension status](https://img.shields.io/badge/status-ready-success 'ready to be used')](https://jupyterlab-contrib.github.io/)
[![Github Actions Status](https://github.com/jupyterlab-contrib/jlab-enhanced-launcher/workflows/Build/badge.svg)](https://github.com/jupyterlab-contrib/jlab-enhanced-launcher/actions?query=workflow%3ABuild)
[![Binder](https://mybinder.org/badge_logo.svg)](https://mybinder.org/v2/gh/jupyterlab-contrib/jlab-enhanced-launcher/master?urlpath=lab)
[![npm](https://img.shields.io/npm/v/@jlab-enhanced/launcher)](https://www.npmjs.com/package/@jlab-enhanced/launcher)
[![PyPI](https://img.shields.io/pypi/v/jlab-enhanced-launcher)](https://pypi.org/project/jlab-enhanced-launcher)
[![conda-forge](https://img.shields.io/conda/vn/conda-forge/jlab-enhanced-launcher)](https://anaconda.org/conda-forge/jlab-enhanced-launcher)

A enhanced launcher for JupyterLab.

![Demo](https://raw.githubusercontent.com/jupyterlab-contrib/jlab-enhanced-launcher/master/enh_launcher.gif)

This codes started from https://github.com/jupyterlab/jupyterlab/pull/5953.

## Requirements

- JupyterLab >= 3.0

For JupyterLab 2.x, have look [there](https://github.com/jupyterlab-contrib/jlab-enhanced-launcher/tree/2.x).

## Install

```bash
pip install jlab-enhanced-launcher
```

or

```bash
conda install -c conda-forge jlab-enhanced-launcher
```

### Uninstall

```bash
pip uninstall jlab-enhanced-launcher
```

or

```bash
conda remove -c conda-forge jlab-enhanced-launcher
```

## Create local conda environment using Miniconda.

Note: You will need to create seperate python virtual environment for Development purpose.

Please download appropriate miniconda packege from this link: https://docs.conda.io/en/latest/miniconda.html

### Create Python Virtual Environment using miniconda.

```bash

export MINICONDA_PACKAGE_PATH=<path>
export MINICONDA_INSTALLATION_PATH=<path>
export PYTHON_VENV_PATH=<path>
export CONDA_PATH=${MINICONDA_INSTALLATION_PATH}/bin/conda
export PYTHON_VENV_PATH_PYTHON_PATH=${PYTHON_VENV_PATH}/bin/python

export CURRENT_SHELL=`ps -p $$ | tail -n 1 | cut -d " " -f7 | cut -d "/" -f3`

bash $MINICONDA_PACKAGE_PATH -b -p $MINICONDA_INSTALLATION_PATH

$CONDA_PATH create --prefix $PYTHON_VENV_PATH python=3
$CONDA_PATH init $CURRENT_SHELL
$CONDA_PATH activate $PYTHON_VENV_PATH

# Install require packages.
$PYTHON_VENV_PATH_PYTHON_PATH -m pip install -U pip
$PYTHON_VENV_PATH_PYTHON_PATH -m pip install wheel
$PYTHON_VENV_PATH_PYTHON_PATH -m pip install jupyterhub jupyterlab
$PYTHON_VENV_PATH_PYTHON_PATH -m pip install ipywidgets

# Make sure to clone github repository into
cd ${PYTHON_VENV_PATH}/etc/
git clone https://github.com/ColfaxResearch/jlab-enhanced-launcher.git

# From inside the jlab-enhanced-launcher directory run the following steps.
cd ${PYTHON_VENV_PATH}/etc/jlab-enhanced-launcher


#Make sure to use pip, jlpm from $PYTHON_VENV/bin/jlpm and $PYTHON_VENV/bin/pip and also disable the default Launcher @jupyterlab/launcher-extension
```

## Contributing

### Development install

Note: You will need NodeJS to build the extension package.

The `jlpm` command is JupyterLab's pinned version of
[yarn](https://yarnpkg.com/) that is installed with JupyterLab. You may use
`yarn` or `npm` in lieu of `jlpm` below.

Make sure to use pip, jlpm from $PYTHON_VENV/bin/jlpm and $PYTHON_VENV/bin/pip and also disable the default Launcher @jupyterlab/launcher-extension

```bash
# Clone the repo to your local environment
# Change directory to the jlab_enhanced_launcher directory
# Install package in development mode
pip install -e .
# Link your development version of the extension with JupyterLab
jupyter labextension develop . --overwrite
# Rebuild extension Typescript source after making changes
jlpm run build
```

You can watch the source directory and run JupyterLab at the same time in different terminals to watch for changes in the extension's source and automatically rebuild the extension.

```bash
# Watch the source directory in one terminal, automatically rebuilding when needed
jlpm run watch
# Run JupyterLab in another terminal
jupyter lab
```

With the watch command running, every saved change will immediately be built locally and available in your running JupyterLab. Refresh JupyterLab to load the change in your browser (you may need to wait several seconds for the extension to be rebuilt).

By default, the `jlpm run build` command generates the source maps for this extension to make it easier to debug using the browser dev tools. To also generate source maps for the JupyterLab core extensions, you can run the following command:

```bash
jupyter lab build --minimize=False
```
