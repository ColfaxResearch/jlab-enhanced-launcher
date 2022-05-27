/* eslint-disable no-inner-declarations */
// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  showErrorMessage,
  VDomModel,
  VDomRenderer
} from '@jupyterlab/apputils';

import {
  nullTranslator,
  TranslationBundle,
  ITranslator
} from '@jupyterlab/translation';

import { ILauncher } from '@jupyterlab/launcher';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import { IStateDB } from '@jupyterlab/statedb';

import {
  ArrayExt,
  ArrayIterator,
  each,
  IIterator,
  map,
  toArray
} from '@lumino/algorithm';

import { CommandRegistry } from '@lumino/commands';

import { ReadonlyJSONObject, JSONObject } from '@lumino/coreutils';

import { DisposableDelegate, IDisposable } from '@lumino/disposable';

import { AttachedProperty } from '@lumino/properties';

import { Widget } from '@lumino/widgets';

import * as React from 'react';

import {
  viewListIcon,
  viewModuleIcon,
  bludDirectoryIcon,
  terminalIcon,
  pyIcon
} from './icons';

/**
 * Extension identifier
 */
export const EXTENSION_ID = '@jlab-enhanced/launcher:plugin';

/**
 * The class name added to Launcher instances.
 */
const LAUNCHER_CLASS = 'jp-NewLauncher';

/**
 * These launcher item categories are known to have kernels, so the kernel icons
 * are used.
 */
const KERNEL_CATEGORIES = ['Notebook', 'Console'];

/**
 * IUsageData records the count of usage and the most recent date of usage
 * for a certain kernel or card.
 */
export interface IUsageData {
  /**
   * Count the number that a certain card is used.
   */
  count: number;

  /**
   * The most recent timestamp a certain card is used.
   */
  mostRecent: number;
}

/**
 * LauncherModel keeps track of the path to working directory and has a list of
 * LauncherItems, which the Launcher will render.
 */
export class LauncherModel extends VDomModel implements ILauncher {
  constructor(settings?: ISettingRegistry.ISettings, state?: IStateDB) {
    super();
    this._settings = settings || null;
    this._state = state || null;

    this.dispose();
  }

  /**
   * Generate an unique identifier for a launcher item
   *
   * @param item Launcher item
   */
  static getItemUID(item: ILauncher.IItemOptions): string {
    return `${item.command}${JSON.stringify(item.args || {})}`;
  }

  /**
   * The known categories of launcher items and their default ordering.
   */
  get categories(): string[] {
    if (this._settings) {
      // we will check either customkernel section name is define dor not
      const customKernelsCategoryName = this.customKernelsCategoryName;
      const definedCategories = this._settings.composite[
        'categories'
      ] as string[];
      if (definedCategories.indexOf(customKernelsCategoryName) === -1) {
        definedCategories.push(customKernelsCategoryName);
      }
      return definedCategories;
    } else {
      return ['Kernels', 'Other'];
    }
  }

  /**
   * Get the custom kernels category name if defined, otherwiser return Kernels
   */
  get customKernelsCategoryName(): string {
    if (
      this._settings &&
      this._settings.composite['customKernelsCategoryName']
    ) {
      return this._settings.composite['customKernelsCategoryName'] as string;
    } else {
      'Kernels';
    }
  }

  /**
   * The maximum number of cards showed in recent section
   */
  get nRecentCards(): number {
    if (this._settings) {
      return this._settings.composite['nRecentCards'] as number;
    } else {
      return 4;
    }
  }

  /**
   * Get the setting parameter persistenMostUsedSection to make Most Used section persisten on luncher screen.
   */
  get persistentMostUsedSection(): boolean {
    if (
      this._settings &&
      this._settings.composite['persistentMostUsedSection']
    ) {
      return this._settings.composite['persistentMostUsedSection'] as boolean;
    } else {
      return false;
    }
  }

  /**
   * Get the redirect link defined for documentation
   */
  get documentationRedirectLink(): string {
    if (
      this._settings &&
      this._settings.composite['documentationRedirectLink']
    ) {
      return this._settings.composite['documentationRedirectLink'] as string;
    } else {
      return '#';
    }
  }

  /**
   * Time (in milliseconds) after which the usage is considered to old
   */
  get maxUsageAge(): number {
    let age = 30;
    if (this._settings) {
      age = this._settings.composite['maxUsageAge'] as number;
    }
    return age * 24 * 3600 * 1000;
  }

  /**
   * Card usage data
   */
  get usage(): { [cardId: string]: IUsageData } {
    return this._usageData;
  }

  /**
   * Launcher view mode
   */
  get viewMode(): 'cards' | 'table' {
    return this._viewMode;
  }
  set viewMode(mode: 'cards' | 'table') {
    const hasChanged = this._viewMode !== mode;
    this._viewMode = mode;
    if (this._state && hasChanged) {
      this._state.save(`${EXTENSION_ID}:viewMode`, mode).catch(reason => {
        console.error('Fail to save view mode', reason);
      });
    }
  }

  /**
   * Add a command item to the launcher, and trigger re-render event for parent
   * widget.
   *
   * @param options - The specification options for a launcher item.
   *
   * @returns A disposable that will remove the item from Launcher, and trigger
   * re-render event for parent widget.
   *
   */
  add(options: ILauncher.IItemOptions): IDisposable {
    // Create a copy of the options to circumvent mutations to the original.
    const item = Private.createItem(options);

    this._items.push(item);
    this.stateChanged.emit(void 0);

    return new DisposableDelegate(() => {
      ArrayExt.removeFirstOf(this._items, item);
      this.stateChanged.emit(void 0);
    });
  }

  /**
   * Return an iterator of copied launcher items.
   */
  items(): IIterator<INewLauncher.IItemOptions> {
    return new ArrayIterator(
      this._items.map(item => {
        const key = LauncherModel.getItemUID(item);
        const usage = this._usageData[key] || {
          count: 0,
          mostRecent: 0
        };
        return { ...item, ...usage };
      })
    );
  }

  /**
   * Return all the items of given categories
   */
  categoryItems(cat: string): INewLauncher.IItemOptions[] {
    if (!this._settings.composite[cat]) {
      const allitemFinal: INewLauncher.IItemOptions[] = [];
      return allitemFinal;
    } else {
      const allItem = this._settings.composite[cat] as {
        args: object;
        command: string;
        category: string;
        rank: number;
      }[];

      const allitemFinal: INewLauncher.IItemOptions[] = [];

      for (let i = 0; i < allItem.length; i++) {
        const actualItem = allItem[i] as ILauncher.IItemOptions;
        const key = LauncherModel.getItemUID(actualItem);
        const usage = this._usageData[key] || {
          count: 0,
          mostRecent: 0
        };
        allitemFinal.push({ ...actualItem, ...usage });
      }

      return allitemFinal;
    }
  }

  /**
   *  Return all the items of all the categories if defined
   */
  allCategoryItems(): INewLauncher.IItemOptions[] {
    const allCatList = this.categories;

    if (allCatList) {
      const allCategoryItems: INewLauncher.IItemOptions[] = [];
      const lengthOfCategories = allCatList.length;
      for (let i = 0; i < lengthOfCategories; i++) {
        const allItemsOfCateogry = this.categoryItems(allCatList[i]);

        allCategoryItems.push(...allItemsOfCateogry);
      }
      return allCategoryItems;
    } else {
    }
  }

  /**
   * Handle card usage data when used.
   *
   * @param item Launcher item
   */
  useCard(item: ILauncher.IItemOptions): void {
    const id = LauncherModel.getItemUID(item);
    const usage = this._usageData[id];
    const now = Date.now();
    let currentCount = 0;
    if (usage && now - usage.mostRecent < this.maxUsageAge) {
      currentCount = usage.count;
    }
    this._usageData[id] = {
      count: currentCount + 1,
      mostRecent: now
    };
    if (this._state) {
      this._state
        .save(`${EXTENSION_ID}:usageData`, this._usageData as any)
        .catch((reason: Error) => {
          console.error(
            `Failed to save ${EXTENSION_ID}:usageData - ${reason.message}`,
            reason
          );
        });
    }
  }

  private _items: ILauncher.IItemOptions[] = [];
  private _settings: ISettingRegistry.ISettings | null = null;
  private _state: IStateDB | null = null;
  private _usageData: { [key: string]: IUsageData } = {};
  private _viewMode: 'cards' | 'table' = 'cards';
}

/**
 * A virtual-DOM-based widget for the Launcher.
 */
export class Launcher extends VDomRenderer<LauncherModel> {
  /**
   * Construct a new launcher widget.
   */
  constructor(options: INewLauncher.IOptions) {
    super(options.model);
    this._cwd = options.cwd;
    this.id = options.id;
    this.translator = options.translator || nullTranslator;
    this._trans = this.translator.load('jupyterlab');
    this._callback = options.callback;
    this._commands = options.commands;
    this.addClass(LAUNCHER_CLASS);
  }

  /**
   * The cwd of the launcher.
   */
  get cwd(): string {
    return this._cwd;
  }
  set cwd(value: string) {
    this._cwd = value;
    this.update();
  }

  /**
   * Whether there is a pending item being launched.
   */
  get pending(): boolean {
    return this._pending;
  }
  set pending(value: boolean) {
    this._pending = value;
  }

  /**
   * Render the launcher to virtual DOM nodes.
   */
  protected render(): React.ReactElement<any> | null {
    // Bail if there is no model.
    if (!this.model) {
      return null;
    }

    const mode = this.model.viewMode === 'cards' ? '' : '-Table';
    // First group-by categories
    const categories: {
      [category: string]: INewLauncher.IItemOptions[][];
    } = Object.create(null);
    each(this.model.items(), (item, index) => {
      const cat = item.category || 'Other';
      if (!(cat in categories)) {
        categories[cat] = [];
      }
      categories[cat].push([item]);
    });

    // Find all the custom category items
    const customItem = this.model.allCategoryItems();
    if (customItem) {
      customItem.forEach(function(Item) {
        const cat = Item.category || 'Other';
        if (!(cat in categories)) {
          categories[cat] = [];
        }
        categories[cat].push([Item]);
      });
    }

    // Merge kernel items
    const notebooks = categories['Notebook'];
    if (notebooks) {
      delete categories['Notebook'];
    }
    const consoles = categories['Console'];
    if (consoles) {
      delete categories['Console'];
    }

    const kernels = notebooks;
    consoles.forEach(console_ => {
      const consoleName =
        (console_[0].args['kernelPreference'] &&
          (console_[0].args['kernelPreference'] as ReadonlyJSONObject)[
            'name'
          ]) ||
        '';
      const consoleLabel = this._commands.label(
        console_[0].command,
        console_[0].args
      );
      const kernel = kernels.find(kernel => {
        // kernel comes from notebook
        const kernelName = kernel[0].args['kernelName'] || '';
        const kernelLabel = this._commands.label(
          kernel[0].command,
          kernel[0].args
        );
        return kernelLabel === consoleLabel && kernelName === consoleName;
      });
      if (kernel) {
        kernel.push(console_[0]);
      } else {
        kernels.push(console_);
      }
    });

    // Just used customKernelsCategoryName is defined otherwiser default value is Kernels
    const customKernelsCategoryName = this.model.customKernelsCategoryName;
    categories[customKernelsCategoryName] = kernels;

    // Just keep items of the defined category
    const definedCategory = this.model.categories;
    for (const cat in categories) {
      if (definedCategory.indexOf(cat) === -1) {
        delete categories[cat];
      }
    }

    // Within each category sort by rank
    for (const cat in categories) {
      categories[cat] = categories[cat].sort(
        (a: INewLauncher.IItemOptions[], b: INewLauncher.IItemOptions[]) => {
          return Private.sortCmp(a[0], b[0], this._cwd, this._commands);
        }
      );
    }

    // Variable to help create sections
    const sections: React.ReactElement<any>[] = [];

    // Assemble the final ordered list of categories, beginning with
    // model.categories.
    const orderedCategories: string[] = [];
    each(this.model.categories, (cat, index) => {
      if (cat in categories) {
        orderedCategories.push(cat);
      }
    });
    for (const cat in categories) {
      if (this.model.categories.indexOf(cat) === -1) {
        orderedCategories.push(cat);
      }
    }

    const mostUsedItems = toArray(customItem).sort(
      (a: INewLauncher.IItemOptions, b: INewLauncher.IItemOptions) => {
        return Private.sortByUsage(
          a,
          b,
          this.model.maxUsageAge,
          this._cwd,
          this._commands
        );
      }
    );

    function viewMostUsedSection(id: string) {
      var dvMostUsed = document.getElementById(`most-used-${id}`);
      var mostusedCheckBox = document.getElementById(
        `mostUsed-${id}`
      ) as HTMLInputElement;
      dvMostUsed.style.display = mostusedCheckBox.checked ? 'block' : 'none';
    }

    function seacrhOnChange(targetValue: string, id: string) {
      if (targetValue.length === 1) {
        var viewButtons = document.getElementsByName(`viewall-${id}`);
        for (var i = 0; i <= viewButtons.length; i++) {
          var viewButtonElm = viewButtons[i] as HTMLElement;
          if (viewButtonElm) {
            if (viewButtonElm.innerHTML === 'View All') {
              viewButtonElm.click();
            }
            viewButtonElm.style.display = 'none';
          }
        }

        var cardCount = document.getElementsByClassName(
          'jp-NewLauncher-SectionItemCount'
        );
        for (var i = 0; i <= cardCount.length; i++) {
          var cardCountElm = cardCount[i] as HTMLElement;
          if (
            cardCountElm &&
            cardCountElm.id.split('-')[2] === id.split('-')[1]
          ) {
            cardCountElm.style.display = 'none';
          }
        }
      }
      if (targetValue.length === 0) {
        var viewButtons = document.getElementsByName(`viewall-${id}`);
        for (var i = 0; i <= viewButtons.length; i++) {
          var viewButtonElm = viewButtons[i] as HTMLElement;
          if (viewButtonElm) {
            viewButtonElm.removeAttribute('style');
            viewButtonElm.click();
          }
        }
        var cardCount = document.getElementsByClassName(
          'jp-NewLauncher-SectionItemCount'
        );
        for (var i = 0; i <= cardCount.length; i++) {
          var cardCountElm = cardCount[i] as HTMLElement;
          if (
            cardCountElm &&
            cardCountElm.id.split('-')[2] === id.split('-')[1]
          ) {
            cardCountElm.removeAttribute('style');
          }
        }
      }
    }

    function openTerminal(commands: CommandRegistry) {
      commands.execute('terminal:create-new');
    }

    // Render the most used items, before rendering will make sure if its set to keep or based on checkbox.
    if (this._searchInput === '') {
      const mostUsedSection = (
        <div
          className="jp-NewLauncher-section"
          key="most-used"
          id={`most-used-${this.id}`}
          style={{
            display: this.model.persistentMostUsedSection ? 'block' : 'none'
          }}
        >
          <div className="jp-NewLauncher-sectionHeader">
            {/* <mostUsedIcon.react stylesheet="launcherSection" /> */}
            <h2 className="jp-NewLauncher-sectionTitle">
              {this._trans.__('Most Used')}
            </h2>
          </div>
          <div className={`jp-NewLauncher${mode}-cardContainer`}>
            {toArray(
              map(
                mostUsedItems.slice(0, this.model.nRecentCards),
                (item: INewLauncher.IItemOptions) => {
                  return Card(
                    KERNEL_CATEGORIES.indexOf(item.category || 'Other') > -1,
                    [item],
                    this,
                    this._commands,
                    this._trans,
                    this._callback
                  );
                }
              )
            )}
          </div>
        </div>
      );
      sections.push(mostUsedSection);
    }

    // Now create the sections for each category
    orderedCategories.forEach(cat => {
      if (categories[cat].length === 0) {
        return;
      }

      function viewAllHandler(cat: string, id: string) {
        var cardContainer = document.getElementById(
          `cardContainer-${cat}-${id}`
        ) as HTMLDivElement;
        const catSectionViewButton = document.getElementById(
          `jp-NewLauncher-sectionViewButton-${cat}-${id}`
        ) as HTMLButtonElement;
        if (catSectionViewButton.innerHTML === 'View All') {
          cardContainer.className = 'jp-NewLauncher-cardContainer';
          catSectionViewButton.innerHTML = 'Collapse All';
        } else {
          cardContainer.className = 'jp-NewLauncher-cardContainerShort';
          catSectionViewButton.innerHTML = 'View All';
        }
      }

      const catItemsCount = categories[cat].length;
      // const item = categories[cat][0][0];
      // const args = { ...item.args, cwd: this.cwd };
      const kernel = cat === this.model.customKernelsCategoryName;

      // DEPRECATED: remove _icon when lumino 2.0 is adopted
      // if icon is aliasing iconClass, don't use it
      // const iconClass = this._commands.iconClass(item.command, args);
      // const _icon = this._commands.icon(item.command, args);
      // const icon = _icon === iconClass ? undefined : _icon;

      const section = (
        <div className="jp-NewLauncher-section" key={cat}>
          <div className="jp-NewLauncher-sectionHeader">
            {/* <LabIcon.resolveReact
              icon={icon}
              iconClass={classes(iconClass, 'jp-Icon-cover')}
              stylesheet="launcherSection"
            /> */}
            <h2 className="jp-NewLauncher-sectionTitle">
              {this._trans.__(cat)}
            </h2>
            <div className="jp-NewLauncher-sectionView">
              <span
                className="jp-NewLauncher-SectionItemCount"
                id={`itemcount-${this.id}`}
              >
                ({catItemsCount})
              </span>
              <button
                type="button"
                name={`viewall-${this.id}`}
                id={`jp-NewLauncher-sectionViewButton-${cat}-${this.id}`}
                className="jp-NewLauncher-sectionViewButton"
                onClick={() => viewAllHandler(cat, this.id)}
              >
                View All
              </button>
            </div>
          </div>
          <div
            className={`jp-NewLauncher${mode}-cardContainerShort`}
            id={`cardContainer-${cat}-${this.id}`}
            key="cardContainer"
          >
            {toArray(
              map(categories[cat], (items: INewLauncher.IItemOptions[]) => {
                const item = items[0];
                const command = item.command;
                const args = { ...item.args, cwd: this.cwd };
                const label = this._commands.label(command, args);

                // Apply filter for custom items label
                const customItem = items[0] as INewLauncher.IItemOptions;
                const customItemargs = customItem.args as JSONObject;
                const customItemTitle = customItemargs['title'] as string;

                if (kernel) {
                  if (
                    label
                      .toLocaleLowerCase()
                      .indexOf(this._searchInput.toLocaleLowerCase()) === -1
                  ) {
                    return null;
                  }
                } else {
                  if (customItemTitle) {
                    const customItemTag = customItemargs['tag'] as string;
                    const customItemDescription = customItemargs[
                      'description'
                    ] as string;
                    const customItemSearchFromStr = customItemTitle
                      .concat(customItemTag)
                      .concat(customItemDescription);
                    if (
                      customItemSearchFromStr
                        .toLocaleLowerCase()
                        .indexOf(this._searchInput.toLocaleLowerCase()) === -1
                    ) {
                      return null;
                    } else {
                    }
                  }
                }

                return Card(
                  kernel,
                  items,
                  this,
                  this._commands,
                  this._trans,
                  this._callback
                );
              })
            )}
          </div>
        </div>
      );
      sections.push(section);
    });

    // Wrap the sections in body and content divs.
    return (
      <div className="jp-NewLauncher-body">
        <div className="jp-NewLauncher-content">
          <div className="jp-NewLauncher-toolbar">
            <div className="jp-NewLauncher-search">
              <div className="jp-NewLauncher-search-wrapper">
                <input
                  className="nosubmit"
                  type="search"
                  placeholder="Search..."
                  spellCheck={false}
                  onChange={(event): void => {
                    this._searchInput = event.target.value || '';
                    this.update();
                    seacrhOnChange(event.target.value, this.id);
                  }}
                />
              </div>
            </div>
            <div className="jp-NewLauncher-Mostused-content">
              <label
                className="jp-NewLauncher-Mostused-Check"
                style={{
                  display: this.model.persistentMostUsedSection ? 'none' : ''
                }}
              >
                <input
                  type="checkbox"
                  id={`mostUsed-${this.id}`}
                  name="mostUsed"
                  onClick={() => viewMostUsedSection(this.id)}
                ></input>
                <span className="slider">
                  <div className="tooltip">
                    <p className="tooltipMostUsed">Most Used</p>

                    <span className="tooltiptext">
                      Make "Most Used" section persistent in Launcher.
                    </span>
                  </div>
                </span>
                <span className="labels" data-on="Hide" data-off="Show"></span>
                {/* <div className="tooltip">
                  <p className="tooltipMostUsed">Most Used</p>

                  <span className="tooltiptext">
                    Make "Most Used" section persistent in Launcher.
                  </span>
                </div> */}
              </label>
            </div>
            <div>
              <button
                onClick={() => openTerminal(this._commands)}
                className="jp-NewLauncher-Terminal-Button"
                title="Open Terminal"
              >
                <terminalIcon.react />
              </button>
            </div>
            <div>
              <p className="jp-topHeaderTerminalText">Terminal</p>
            </div>
            <div>
              <a
                href={this.model.documentationRedirectLink}
                className="jp-topHeaderTextDoc"
                target="_blank"
              >
                Documentation
              </a>
            </div>
            <div className="jp-NewLauncher-view">
              <button
                disabled={this.model.viewMode === 'cards'}
                onClick={(): void => {
                  this.model.viewMode = 'cards';
                  this.update();
                }}
              >
                <viewModuleIcon.react
                  tag="span"
                  title="Card view"
                  elementPosition="center"
                />
              </button>
              <button
                disabled={this.model.viewMode === 'table'}
                onClick={(): void => {
                  this.model.viewMode = 'table';
                  this.update();
                }}
              >
                <viewListIcon.react
                  tag="span"
                  title="Table view"
                  elementPosition="center"
                />
              </button>
            </div>
          </div>
          {/* This section will list the currunt working directory path */}
          <div className="jp-NewLauncher-cwd">
            <bludDirectoryIcon.react
              className="jp-NewLauncher-home"
              margin="0px 5px 0px 10px"
            />
            <h3 title={this.cwd}>{`${this.cwd}/`}</h3>
          </div>
          <div className="jp-NewLauncher-content-main">{sections}</div>
        </div>
      </div>
    );
  }

  protected translator: ITranslator;
  private _commands: CommandRegistry;
  private _callback: (widget: Widget) => void;
  private _cwd = '';
  private _pending = false;
  private _searchInput = '';
  private _trans: TranslationBundle;
}

/**
 * The namespace for `ILauncher` class statics.
 */
export namespace INewLauncher {
  /**
   * The options used to create a Launcher.
   */
  export interface IOptions {
    /**
     * The model of the launcher.
     */
    model: LauncherModel;

    /**
     * The cwd of the launcher.
     */
    cwd: string;

    /**
     * The command registry used by the launcher.
     */
    commands: CommandRegistry;

    /**
     * The application language translation.
     */
    translator?: ITranslator;

    /**
     * Allow to identify the exact element clicked
     */
    id: string;

    /**
     * The callback used when an item is launched.
     */
    callback: (widget: Widget) => void;
  }

  export interface IItemOptions extends ILauncher.IItemOptions, IUsageData {}
}

/**
 * A pure tsx component for a launcher card.
 *
 * @param kernel - whether the item takes uses a kernel.
 *
 * @param item - the launcher item to render.
 *
 * @param launcher - the Launcher instance to which this is added.
 *
 * @param launcherCallback - a callback to call after an item has been launched.
 *
 * @returns a vdom `VirtualElement` for the launcher card.
 */
function Card(
  kernel: boolean,
  items: INewLauncher.IItemOptions[],
  launcher: Launcher,
  commands: CommandRegistry,
  trans: TranslationBundle,
  launcherCallback: (widget: Widget) => void
): React.ReactElement<any> {
  const mode = launcher.model.viewMode === 'cards' ? '' : '-Table';

  // Get some properties of the first command
  const item = items[0];
  const command = item.command;
  const args = { ...item.args, cwd: launcher.cwd };
  const caption = commands.caption(command, args);
  const label = commands.label(command, args);
  const title = kernel ? label : caption || label;

  // Ge the Custom Item Object
  const customItem = items[0] as INewLauncher.IItemOptions;

  const customItemargs = customItem.args as JSONObject;

  // Get the custom item ICON's png file name
  const customItemPngFileName =
    'icon' in customItemargs ? (customItemargs['icon'] as string) : 'none';

  // Find index based on the file name
  const AllWebPack = require.context('../style/images', false, /\.png$/);
  const customItemPngFileNameStr = `./${customItemPngFileName}`;
  const customItemPngID = AllWebPack.keys().indexOf(customItemPngFileNameStr);

  // Get all webpack of all the PNG file from directory
  function importAll(r: any) {
    return r.keys().map(r);
  }
  const imageDir = importAll(
    require.context('../style/images', false, /\.png$/)
  );

  console.log(AllWebPack.keys());

  // Get the IconWebPack to render the Icon as img in Launcher
  const IconWebPack = imageDir[customItemPngID];

  // Get the label tag of the item
  const customItemTitle = customItemargs['title'] as string;

  // Get the title of the item
  const customItemTag = customItemargs['tag'] as string;

  // Get the discription of the item
  const customItemDesc = customItemargs['description'] as string;

  // console.log(customItemIconStr);

  // Build the onclick handler.
  const onClickFactory = (
    item: INewLauncher.IItemOptions
  ): ((event: any) => void) => {
    const onClick = (event: Event): void => {
      event.stopPropagation();
      // If an item has already been launched,
      // don't try to launch another.
      if (launcher.pending === true) {
        return;
      }
      launcher.pending = true;
      commands.execute('launcher:create');
      void commands
        .execute(item.command, {
          ...item.args,
          cwd: launcher.cwd
        })
        .then(value => {
          launcher.model.useCard(item);
          launcher.pending = false;
          if (value instanceof Widget) {
            launcherCallback(value);
            launcher.dispose();
          }
        })
        .catch(err => {
          launcher.pending = false;
          void showErrorMessage(trans._p('Error', 'Launcher Error'), err);
        });
    };

    return onClick;
  };
  const mainOnClick = onClickFactory(item);

  const getOptions = (items: INewLauncher.IItemOptions[]): JSX.Element[] => {
    return items.map(item => {
      let label = 'Open';
      if (
        item.category &&
        (items.length > 1 || KERNEL_CATEGORIES.indexOf(item.category) > -1)
      ) {
        label = item.category;
      }
      return (
        <div
          className="jp-NewLauncher-option-button"
          key={label.toLowerCase()}
          onClick={onClickFactory(item)}
        >
          <span className="jp-NewLauncher-option-button-text">
            {label.toUpperCase()}
          </span>
        </div>
      );
    });
  };

  // With tabindex working, you can now pick a kernel by tabbing around and
  // pressing Enter.
  const onkeypress = (event: React.KeyboardEvent): void => {
    if (event.key === 'Enter') {
      mainOnClick(event);
    }
  };

  // DEPRECATED: remove _icon when lumino 2.0 is adopted
  // if icon is aliasing iconClass, don't use it
  // const iconClass = commands.iconClass(command, args);
  // const _icon = commands.icon(command, args);
  // const icon = _icon === iconClass ? undefined : _icon;

  if (kernel) {
    // If it is kernel item please use different CSS style
    return (
      <div
        className={`jp-NewLauncher-item${mode}-kernel`}
        title={title}
        onClick={mainOnClick}
        onKeyPress={onkeypress}
        tabIndex={100}
        data-category={item.category}
        key={Private.keyProperty.get(item)}
      >
        <div className="jp-Newlauncher-kernel-Top">
          <pyIcon.react className="jp-NewLauncher-kernelIcon" />
          <div
            className={`jp-NewLauncher-label jp-NewLauncher${mode}-Cell`}
            title={label}
          >
            {label.split('(')[1].split(')')[0]}
          </div>
        </div>

        <div
          className={`jp-NewLauncher-options-wrapper jp-NewLauncher${mode}-Cell`}
        >
          <div className="jp-NewLauncher-options">{getOptions(items)}</div>
        </div>
      </div>
    );
  }

  // Return the VDOM element.
  return (
    <div
      className={`jp-NewLauncher-item${mode}`}
      title={title}
      onClick={mainOnClick}
      onKeyPress={onkeypress}
      tabIndex={100}
      data-category={item.category}
      key={Private.keyProperty.get(item)}
    >
      <div className="jp-NewLauncherCard-top">
        <div className={`jp-NewLauncherCard-icon jp-NewLauncher${mode}-Cell`}>
          <img src={IconWebPack.default} alt="" className="jp-CustomItemIcon" />
        </div>
        <div className="jp-NewLauncherCard-header">
          <div className="jp-NewLauncherCard-title" title={customItemTitle}>
            {customItemTitle}
          </div>
          <div className="jp-NewLauncherCard-label" title={customItemTag}>
            {customItemTag}
          </div>
        </div>
      </div>
      <div className="jp-NewLauncherCard-bottom">
        <div className="jp-NewLauncherCard-item-description">
          <p>{customItemDesc}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * The namespace for module private data.
 */
namespace Private {
  /**
   * An incrementing counter for keys.
   */
  let id = 0;

  /**
   * An attached property for an item's key.
   */
  export const keyProperty = new AttachedProperty<
    INewLauncher.IItemOptions,
    number
  >({
    name: 'key',
    create: (): number => id++
  });

  /**
   * Create a fully specified item given item options.
   */
  export function createItem(
    options: ILauncher.IItemOptions
  ): ILauncher.IItemOptions {
    return {
      ...options,
      category: options.category || '',
      rank: options.rank !== undefined ? options.rank : Infinity
    };
  }

  /**
   * A sort comparison function for a launcher item.
   */
  export function sortCmp(
    a: INewLauncher.IItemOptions,
    b: INewLauncher.IItemOptions,
    cwd: string,
    commands: CommandRegistry
  ): number {
    // First, compare by rank.
    const r1 = a.rank;
    const r2 = b.rank;
    if (r1 !== r2 && r1 !== undefined && r2 !== undefined) {
      return r1 < r2 ? -1 : 1; // Infinity safe
    }

    // Finally, compare by display name.
    const aLabel = commands.label(a.command, { ...a.args, cwd });
    const bLabel = commands.label(b.command, { ...b.args, cwd });
    return aLabel.localeCompare(bLabel);
  }

  export function sortByUsage(
    a: INewLauncher.IItemOptions,
    b: INewLauncher.IItemOptions,
    maxUsageAge: number,
    cwd: string,
    commands: CommandRegistry
  ): number {
    const now = Date.now();

    const aCount = now - a.mostRecent < maxUsageAge ? a.count : 0;
    const bCount = now - b.mostRecent < maxUsageAge ? b.count : 0;
    if (aCount === bCount) {
      const mostRecent = b.mostRecent - a.mostRecent;
      return mostRecent === 0 ? sortCmp(a, b, cwd, commands) : mostRecent;
    }
    return bCount - aCount;
  }
}
