/**
 * Copyright (c) Tiny Technologies, Inc. All rights reserved.
 * Licensed under the LGPL or a commercial license.
 * For LGPL see License.txt in the project root for license information.
 * For commercial licenses see https://www.tiny.cloud/
 */

import { Types } from '@ephox/bridge';
import { Element, HTMLElement } from '@ephox/dom-globals';
import { Arr, Cell, Merger, Obj, Option, Type } from '@ephox/katamari';
import Editor from 'tinymce/core/api/Editor';
import Settings from '../api/Settings';
import { dataToHtml } from '../core/DataToHtml';
import * as HtmlToData from '../core/HtmlToData';
import Service from '../core/Service';
import { MediaData } from '../core/Types';
import UpdateHtml from '../core/UpdateHtml';

type ApiSubData = {
  value: string;
  meta: Record<string, any>;
};

type ApiData = {
  source?: ApiSubData;
  altsource?: ApiSubData;
  poster?: ApiSubData;
  embed?: string;
  dimensions?: {
    width?: string;
    height?: string;
  };
};

const extractMeta = (sourceInput: string, data: ApiData): Option<Record<string, any>> => {
  return Obj.get(data, sourceInput as any).bind((mainData: ApiSubData) => Obj.get(mainData, 'meta'));
};

const getValue = (data: ApiData, metaData: Record<string, any>) => (prop: string): Record<string, string> => {
  // Cases:
  // 1. Get the nested value prop (component is the executed urlinput)
  // 2. Get from metadata (a urlinput was executed but urlinput != this component)
  // 3. Not a urlinput so just get string
  // ASSUMPTION: we only want to get values for props that already exist in data
  const getFromData: Option<string | Record<string, string>> = Obj.get(data, prop as any);
  const getFromMetaData: Option<string> = Obj.get(metaData, prop);
  const getNonEmptyValue = (c: Record<string, string>) => Obj.get(c, 'value').bind((v) => v.length > 0 ? Option.some(v) : Option.none());

  return getFromData.bind((child): Option<Record<string, string>> => {
    const val = Type.isObject(child) ? getNonEmptyValue(child as Record<string, string>).or(getFromMetaData) : getFromMetaData.or(getFromData as Option<string>);
    return val.fold(() => Option.none(), (v: string) => Option.some({ [prop]: v }));
  }).getOr({});
};

const getDimensions = (data: ApiData, metaData: Record<string, string>) => {
  const dimensions = {};
  Obj.get(data, 'dimensions').each((dims) => {
    Arr.each([ 'width', 'height' ] as ('width' | 'height')[], (prop) => {
      Obj.get(metaData, prop).or(Obj.get(dims, prop)).each((value) => dimensions[prop] = value);
    });
  });
  return dimensions;
};

const unwrap = (data: ApiData, sourceInput?: string): MediaData => {
  const metaData = sourceInput ? extractMeta(sourceInput, data).getOr({}) : {};
  const get = getValue(data, metaData);
  return {
    ...get('source'),
    ...get('altsource'),
    ...get('poster'),
    ...get('embed'),
    ...getDimensions(data, metaData)
  } as any;
};

const wrap = (data: MediaData): ApiData => {
  const wrapped = Merger.merge(data, {
    source: { value: Obj.get(data, 'source').getOr('') },
    altsource: { value: Obj.get(data, 'altsource').getOr('') },
    poster: { value: Obj.get(data, 'poster').getOr('') }
  });

  // Add additional size values that may or may not have been in the html
  Arr.each([ 'width', 'height' ] as (keyof MediaData)[], (prop) => {
    Obj.get(data, prop).each((value) => {
      const dimensions = wrapped.dimensions || {};
      dimensions[prop] = value;
      wrapped.dimensions = dimensions;
    });
  });

  return wrapped;
};

const handleError = function (editor: Editor): (error?: { msg: string }) => void {
  return function (error) {
    const errorMessage = error && error.msg ?
      'Media embed handler error: ' + error.msg :
      'Media embed handler threw unknown error.';
    editor.notificationManager.open({ type: 'error', text: errorMessage });
  };
};

const snippetToData = (editor: Editor, embedSnippet: string): MediaData => {
  return HtmlToData.htmlToData(Settings.getScripts(editor), embedSnippet);
};

const isMediaElement = (element: Element) => element.getAttribute('data-mce-object') || element.getAttribute('data-ephox-embed-iri');

const getEditorData = function (editor: Editor): MediaData {
  const element = editor.selection.getNode();
  const snippet = isMediaElement(element) ? editor.serializer.serialize(element, { selection: true }) : '';
  return Merger.merge({ embed: snippet }, HtmlToData.htmlToData(Settings.getScripts(editor), snippet));
};

const addEmbedHtml = function (api: Types.Dialog.DialogInstanceApi<ApiData>, editor: Editor) {
  return function (response: { url: string; html: string }) {
    // Only set values if a URL has been defined
    if (Type.isString(response.url) && response.url.trim().length > 0) {
      const html = response.html;
      const snippetData = snippetToData(editor, html);
      const nuData: MediaData = {
        ...snippetData,
        source: response.url,
        embed: html
      };

      api.setData(wrap(nuData));
    }
  };
};

const selectPlaceholder = function (editor: Editor, beforeObjects: HTMLElement[]) {
  const afterObjects = editor.dom.select('img[data-mce-object]');

  // Find new image placeholder so we can select it
  for (let i = 0; i < beforeObjects.length; i++) {
    for (let y = afterObjects.length - 1; y >= 0; y--) {
      if (beforeObjects[i] === afterObjects[y]) {
        afterObjects.splice(y, 1);
      }
    }
  }

  editor.selection.select(afterObjects[0]);
};

const handleInsert = function (editor: Editor, html: string) {
  const beforeObjects = editor.dom.select('img[data-mce-object]');

  editor.insertContent(html);
  selectPlaceholder(editor, beforeObjects);
  editor.nodeChanged();
};

const submitForm = function (prevData: MediaData, newData: MediaData, editor: Editor) {
  newData.embed = UpdateHtml.updateHtml(newData.embed, newData);

  // Only fetch the embed HTML content if the URL has changed from what it previously was
  if (newData.embed && (prevData.source === newData.source || Service.isCached(newData.source))) {
    handleInsert(editor, newData.embed);
  } else {
    Service.getEmbedHtml(editor, newData)
      .then(function (response) {
        handleInsert(editor, response.html);
      }).catch(handleError(editor));
  }
};

const showDialog = function (editor: Editor) {
  const editorData = getEditorData(editor);
  const currentData = Cell<MediaData>(editorData);
  const initialData = wrap(editorData);

  const handleSource = (prevData: MediaData, api: Types.Dialog.DialogInstanceApi<ApiData>) => {
    const serviceData = unwrap(api.getData(), 'source');

    // If a new URL is entered, then clear the embed html and fetch the new data
    if (prevData.source !== serviceData.source) {
      addEmbedHtml(win, editor)({ url: serviceData.source, html: '' });

      Service.getEmbedHtml(editor, serviceData)
        .then(addEmbedHtml(win, editor))
        .catch(handleError(editor));
    }
  };

  const handleEmbed = (api: Types.Dialog.DialogInstanceApi<ApiData>) => {
    const data = unwrap(api.getData());
    const dataFromEmbed = snippetToData(editor, data.embed);
    api.setData(wrap(dataFromEmbed));
  };

  const handleUpdate = (api: Types.Dialog.DialogInstanceApi<ApiData>, sourceInput: string) => {
    const data = unwrap(api.getData(), sourceInput);
    const embed = dataToHtml(editor, data);
    api.setData(wrap({
      ...data,
      embed
    }));
  };

  const mediaInput: Types.Dialog.BodyComponentApi[] = [{
    name: 'source',
    type: 'urlinput',
    filetype: 'media',
    label: 'Source'
  }];
  const sizeInput: Types.Dialog.BodyComponentApi[] = !Settings.hasDimensions(editor) ? [] : [{
    type: 'sizeinput',
    name: 'dimensions',
    label: 'Constrain proportions',
    constrain: true
  }];

  const generalTab = {
    title: 'General',
    name: 'general',
    items: Arr.flatten([ mediaInput, sizeInput ])
  };

  const embedTextarea: Types.Dialog.BodyComponentApi = {
    type: 'textarea',
    name: 'embed',
    label: 'Paste your embed code below:'
  };
  const embedTab = {
    title: 'Embed',
    items: [
      embedTextarea
    ]
  };

  const advancedFormItems: Types.Dialog.BodyComponentApi[] = [];

  if (Settings.hasAltSource(editor)) {
    advancedFormItems.push({
        name: 'altsource',
        type: 'urlinput',
        filetype: 'media',
        label: 'Alternative source URL'
      }
    );
  }

  if (Settings.hasPoster(editor)) {
    advancedFormItems.push({
      name: 'poster',
      type: 'urlinput',
      filetype: 'image',
      label: 'Media poster (Image URL)'
    });
  }

  const advancedTab = {
    title: 'Advanced',
    name: 'advanced',
    items: advancedFormItems
  };

  const tabs = [
    generalTab,
    embedTab
  ];

  if (advancedFormItems.length > 0) {
    tabs.push(advancedTab);
  }

  const body: Types.Dialog.TabPanelApi = {
    type: 'tabpanel',
    tabs
  };
  const win = editor.windowManager.open({
    title: 'Insert/Edit Media',
    size: 'normal',

    body,
    buttons: [
      {
        type: 'cancel',
        name: 'cancel',
        text: 'Cancel'
      },
      {
        type: 'submit',
        name: 'save',
        text: 'Save',
        primary: true
      }
    ],
    onSubmit (api) {
      const serviceData = unwrap(api.getData());
      submitForm(currentData.get(), serviceData, editor);
      api.close();
    },
    onChange (api, detail) {
      switch (detail.name) {
        case 'source':
          handleSource(currentData.get(), api);
          break;

        case 'embed':
          handleEmbed(api);
          break;

        case 'dimensions':
        case 'altsource':
        case 'poster':
          handleUpdate(api, detail.name);
          break;

        default:
          break;
      }
      currentData.set(unwrap(api.getData()));
    },
    initialData
  });
};

export default {
  showDialog
};
