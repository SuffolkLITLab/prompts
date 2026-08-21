/*
 * API protocol adapters for LIT Prompting.
 *
 * The endpoint selects the wire protocol, keeping provider selection out of the UI:
 *   - endpoints ending in /messages use the Anthropic Messages API shape
 *   - endpoints ending in /responses use the OpenAI Responses API shape
 *   - endpoints ending in /chat/completions (and unknown endpoints, for backward
 *     compatibility) use the OpenAI-compatible Chat Completions shape
 *
 * Template files intentionally retain the historical `max_tokens` and `temperature`
 * keys. This adapter treats them as provider-neutral concepts and translates them
 * into the selected endpoint's request format.
 */
(function(root) {
  'use strict';

  const ANTHROPIC_VERSION = '2023-06-01';

  function endpointPath(endpoint) {
    const value = String(endpoint || '').trim();
    try {
      return new URL(value).pathname.replace(/\/+$/, '') || '/';
    } catch (error) {
      return value.split(/[?#]/, 1)[0].replace(/\/+$/, '');
    }
  }

  function endpointHostname(endpoint) {
    try {
      return new URL(String(endpoint || '').trim()).hostname.toLowerCase();
    } catch (error) {
      return '';
    }
  }

  function isAnthropicDirectHost(endpoint) {
    return endpointHostname(endpoint) === 'api.anthropic.com';
  }

  function isOpenAIDirectHost(endpoint) {
    const host = endpointHostname(endpoint);
    return host === 'api.openai.com' || host.endsWith('.api.openai.com');
  }

  function detectProtocol(endpoint) {
    const path = endpointPath(endpoint).toLowerCase();
    if (/(^|\/)messages$/.test(path)) return 'anthropic_messages';
    if (/(^|\/)responses$/.test(path)) return 'openai_responses';
    return 'openai_chat';
  }

  function isGPT5Family(model) {
    return /^gpt-5(?:[.\-]|$)/i.test(String(model || '').trim());
  }

  function isOpenAIOSeries(model) {
    return /^o\d(?:[.\-]|$)/i.test(String(model || '').trim());
  }

  function isKnownOpenAINonReasoningFamily(model) {
    const value = String(model || '').trim();
    // Keep this deliberately narrow. Known older GPT families are safe to
    // classify as ordinary sampling models; unfamiliar future names should
    // remain "unknown" so direct OpenAI endpoints can expose new controls.
    return /^(?:chat)?gpt-4(?:[.\-]|o|$)/i.test(value) ||
      /^gpt-3(?:[.\-]|$)/i.test(value) ||
      /^(?:text-|davinci|babbage|curie|ada)/i.test(value);
  }

  function classifyOpenAIModel(model) {
    const value = String(model || '').trim();
    if (isGPT5Family(value)) {
      return { kind: 'gpt5', known: true, reasoning: true, verbosity: true };
    }
    if (isOpenAIOSeries(value)) {
      return { kind: 'o_series', known: true, reasoning: true, verbosity: false };
    }
    if (isKnownOpenAINonReasoningFamily(value)) {
      return { kind: 'legacy_sampling', known: true, reasoning: false, verbosity: false };
    }
    return { kind: 'unknown', known: false, reasoning: null, verbosity: null };
  }

  function isOpenAIReasoningFamily(model) {
    const classification = classifyOpenAIModel(model);
    return classification.reasoning === true;
  }

  function optionalNumber(value) {
    if (value === '' || value == null) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function optionalString(value) {
    const text = value == null ? '' : String(value).trim();
    return text || null;
  }

  function getCapabilities(endpoint, model, reasoningEffort) {
    const protocol = detectProtocol(endpoint);
    const openaiDirect = isOpenAIDirectHost(endpoint);
    const modelName = String(model || '').trim();
    const modelClass = openaiDirect ? classifyOpenAIModel(modelName) : null;
    const effort = optionalString(reasoningEffort);

    const capabilities = {
      protocol: protocol,
      protocolLabel: '',
      temperature: true,
      maxOutputTokens: true,
      json: true,
      reasoningEffort: false,
      verbosity: false,
      temperatureReason: '',
      advancedNote: '',
      modelCapabilityStatus: '',
      modelCapabilityKind: openaiDirect ? modelClass.kind : 'endpoint',
      temperatureMin: 0,
      temperatureMax: openaiDirect ? 2 : 1
    };

    if (protocol === 'anthropic_messages') {
      capabilities.protocolLabel = 'Anthropic Messages';
      capabilities.advancedNote = 'Reasoning Effort and Verbosity use OpenAI request fields and are disabled for native Anthropic Messages.';
      capabilities.modelCapabilityStatus = 'Native Anthropic endpoint — OpenAI-specific advanced controls are disabled.';
      return capabilities;
    }

    if (!openaiDirect) {
      capabilities.protocolLabel = protocol === 'openai_responses' ? 'OpenAI-compatible Responses' : 'OpenAI-compatible Chat Completions';
      capabilities.advancedNote = 'Reasoning Effort and Verbosity are disabled for generic compatible endpoints so existing non-OpenAI providers keep their historical request shape.';
      capabilities.modelCapabilityStatus = 'Generic compatible endpoint — conservative compatibility mode.';
      return capabilities;
    }

    capabilities.protocolLabel = protocol === 'openai_responses' ? 'OpenAI Responses' : 'OpenAI Chat Completions';
    capabilities.temperatureMax = 2;

    if (modelClass.kind === 'gpt5') {
      capabilities.reasoningEffort = true;
      capabilities.verbosity = true;
      capabilities.modelCapabilityStatus = 'Known GPT-5-family model — reasoning and verbosity auto-detected.';
    } else if (modelClass.kind === 'o_series') {
      capabilities.reasoningEffort = true;
      capabilities.verbosity = false;
      capabilities.modelCapabilityStatus = 'Known OpenAI reasoning-family model — reasoning auto-detected.';
    } else if (modelClass.kind === 'legacy_sampling') {
      capabilities.reasoningEffort = false;
      capabilities.verbosity = false;
      capabilities.modelCapabilityStatus = 'Known GPT-4/legacy sampling model — advanced reasoning controls are not enabled.';
    } else {
      // Future-friendly behavior for direct OpenAI only: an unfamiliar model
      // can opt into advanced fields, while Auto means those fields are omitted.
      capabilities.reasoningEffort = true;
      capabilities.verbosity = true;
      capabilities.modelCapabilityStatus = modelName
        ? 'Unknown OpenAI model — advanced options are available; Auto omits them.'
        : 'No model specified — direct OpenAI advanced options remain available; Auto omits them.';
    }

    // Known OpenAI reasoning families omit temperature whenever reasoning is
    // active (including Auto, matching the historical GPT-5/o-series behavior).
    // Unknown future OpenAI models are less presumptive: temperature remains
    // available while Reasoning Effort is Auto, and is disabled only after the
    // user explicitly selects a non-None reasoning effort.
    const knownReasoningModel = modelClass.reasoning === true;
    const unknownReasoningSelected = modelClass.kind === 'unknown' && effort && effort !== 'none';
    if ((knownReasoningModel && effort !== 'none') || unknownReasoningSelected) {
      capabilities.temperature = false;
      capabilities.temperatureReason = modelClass.kind === 'unknown'
        ? 'Temperature is omitted because an explicit Reasoning Effort is selected for this unknown OpenAI model. Choose Auto or None to make Temperature available again.'
        : 'Temperature is omitted while OpenAI reasoning is active. Choose Reasoning Effort = None to enable it when that model supports non-reasoning mode.';
    }

    return capabilities;
  }

  function parseSchema(schema) {
    if (schema == null || schema === '') return null;
    if (typeof schema === 'string') {
      if (!schema.trim()) return null;
      return JSON.parse(schema);
    }
    return schema;
  }

  function normalizeOpenAIMessages(messages) {
    return (Array.isArray(messages) ? messages : []).map(function(message) {
      return {
        role: String(message.role || 'user'),
        content: message.content == null ? '' : message.content
      };
    });
  }

  function normalizeAnthropicMessages(messages) {
    const source = Array.isArray(messages) ? messages : [];
    const systemParts = [];
    const conversation = [];

    source.forEach(function(message) {
      const role = String(message.role || 'user').toLowerCase();
      const content = message.content == null ? '' : message.content;

      if (role === 'system' || role === 'developer') {
        systemParts.push(typeof content === 'string' ? content : JSON.stringify(content));
        return;
      }

      if (role !== 'user' && role !== 'assistant') return;

      const last = conversation[conversation.length - 1];
      if (last && last.role === role && typeof last.content === 'string' && typeof content === 'string') {
        last.content += '\n' + content;
      } else {
        conversation.push({ role: role, content: content });
      }
    });

    return {
      system: systemParts.join('\n'),
      messages: conversation
    };
  }

  function shouldIncludeTemperature(config) {
    if (config.temperature == null) return false;
    const caps = getCapabilities(config.endpoint, config.model, config.reasoningEffort);
    return caps.temperature;
  }

  function addOpenAIAdvancedFields(body, config, responsesMode) {
    const caps = getCapabilities(config.endpoint, config.model, config.reasoningEffort);
    const effort = optionalString(config.reasoningEffort);
    const verbosity = optionalString(config.verbosity);

    if (effort && caps.reasoningEffort) {
      if (responsesMode) {
        body.reasoning = { effort: effort };
      } else {
        body.reasoning_effort = effort;
      }
    }

    if (verbosity && caps.verbosity) {
      if (responsesMode) {
        body.text = body.text || {};
        body.text.verbosity = verbosity;
      } else {
        body.verbosity = verbosity;
      }
    }
  }

  function buildOpenAIChat(config) {
    const headers = { 'Content-Type': 'application/json' };
    if (config.apiKey) headers.Authorization = 'Bearer ' + config.apiKey;
    if (isAnthropicDirectHost(config.endpoint)) {
      headers['anthropic-dangerous-direct-browser-access'] = 'true';
    }

    const body = {
      model: config.model,
      messages: normalizeOpenAIMessages(config.messages)
    };

    if (shouldIncludeTemperature(config)) body.temperature = config.temperature;

    if (config.maxTokens != null) {
      // Direct OpenAI uses the current Chat Completions token parameter. Generic
      // compatible servers retain max_tokens for backward compatibility.
      if (isOpenAIDirectHost(config.endpoint)) {
        const modelClass = classifyOpenAIModel(config.model);
        if (modelClass.reasoning === true || modelClass.kind === 'unknown') {
          // Known reasoning models and unknown future OpenAI models use the
          // modern Chat output-token field. Known GPT-4/legacy families keep
          // max_tokens for backward compatibility with existing prompt files.
          body.max_completion_tokens = config.maxTokens;
        } else {
          body.max_tokens = config.maxTokens;
        }
      } else {
        body.max_tokens = config.maxTokens;
      }
    }

    addOpenAIAdvancedFields(body, config, false);

    if (config.jsonMode) {
      const schema = parseSchema(config.jsonSchema);
      if (schema) {
        body.response_format = {
          type: 'json_schema',
          json_schema: {
            name: config.jsonSchemaName || 'structured_response',
            strict: true,
            schema: schema
          }
        };
      } else {
        body.response_format = { type: 'json_object' };
      }
    }

    return {
      protocol: 'openai_chat',
      protocolLabel: isOpenAIDirectHost(config.endpoint) ? 'OpenAI Chat Completions' : 'OpenAI-compatible Chat Completions',
      headers: headers,
      body: body
    };
  }

  function buildOpenAIResponses(config) {
    const headers = { 'Content-Type': 'application/json' };
    if (config.apiKey) headers.Authorization = 'Bearer ' + config.apiKey;

    const body = {
      model: config.model,
      input: normalizeOpenAIMessages(config.messages),
      // LIT Prompting already carries conversation state itself. Keep Responses
      // stateless so changing endpoint/provider does not create hidden server state.
      store: false
    };

    if (shouldIncludeTemperature(config)) body.temperature = config.temperature;
    if (config.maxTokens != null) body.max_output_tokens = config.maxTokens;

    addOpenAIAdvancedFields(body, config, true);

    if (config.jsonMode) {
      const schema = parseSchema(config.jsonSchema);
      body.text = body.text || {};
      if (schema) {
        body.text.format = {
          type: 'json_schema',
          name: config.jsonSchemaName || 'structured_response',
          strict: true,
          schema: schema
        };
      } else {
        body.text.format = { type: 'json_object' };
      }
    }

    return {
      protocol: 'openai_responses',
      protocolLabel: isOpenAIDirectHost(config.endpoint) ? 'OpenAI Responses' : 'OpenAI-compatible Responses',
      headers: headers,
      body: body
    };
  }

  function buildAnthropicMessages(config) {
    const headers = {
      'Content-Type': 'application/json',
      'anthropic-version': ANTHROPIC_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true'
    };
    if (config.apiKey) headers['x-api-key'] = config.apiKey;

    const normalized = normalizeAnthropicMessages(config.messages);
    const body = {
      model: config.model,
      messages: normalized.messages
    };

    if (config.maxTokens != null) body.max_tokens = config.maxTokens;
    if (config.temperature != null) body.temperature = config.temperature;
    if (normalized.system) body.system = normalized.system;

    if (config.jsonMode) {
      const schema = parseSchema(config.jsonSchema);
      if (schema) {
        body.output_config = {
          format: {
            type: 'json_schema',
            schema: schema
          }
        };
      } else {
        const jsonInstruction = 'Return only a valid JSON object. Do not wrap it in Markdown or add text before or after the JSON.';
        body.system = body.system ? body.system + '\n' + jsonInstruction : jsonInstruction;
      }
    }

    return {
      protocol: 'anthropic_messages',
      protocolLabel: 'Anthropic Messages',
      headers: headers,
      body: body
    };
  }

  function buildRequest(config) {
    const protocol = detectProtocol(config.endpoint);
    const normalized = Object.assign({}, config, {
      apiKey: String(config.apiKey || ''),
      jsonMode: config.jsonMode === 1 || config.jsonMode === true,
      maxTokens: optionalNumber(config.maxTokens),
      temperature: optionalNumber(config.temperature),
      reasoningEffort: optionalString(config.reasoningEffort),
      verbosity: optionalString(config.verbosity)
    });

    if (protocol === 'anthropic_messages') return buildAnthropicMessages(normalized);
    if (protocol === 'openai_responses') return buildOpenAIResponses(normalized);
    return buildOpenAIChat(normalized);
  }

  function parseJSONResponse(responseText) {
    if (typeof responseText === 'object' && responseText !== null) return responseText;
    return JSON.parse(responseText);
  }

  function extractOpenAIChat(response) {
    const choice = response && response.choices && response.choices[0];
    if (!choice || !choice.message) throw new Error('The API response did not contain choices[0].message.');
    const content = choice.message.content;
    let text;
    if (typeof content === 'string') {
      text = content;
    } else if (Array.isArray(content)) {
      text = content.map(function(block) {
        if (typeof block === 'string') return block;
        if (block && typeof block.text === 'string') return block.text;
        return '';
      }).join('');
    } else if (content == null) {
      text = '';
    } else {
      text = JSON.stringify(content);
    }
    return {
      text: text,
      finishReason: choice.finish_reason || 'stop'
    };
  }

  function extractOpenAIResponses(response) {
    if (!response || !Array.isArray(response.output)) {
      throw new Error('The Responses API response did not contain an output array.');
    }

    const textParts = [];
    response.output.forEach(function(item) {
      if (!item || item.type !== 'message' || !Array.isArray(item.content)) return;
      item.content.forEach(function(block) {
        if (!block) return;
        if (block.type === 'output_text' && typeof block.text === 'string') {
          textParts.push(block.text);
        } else if (block.type === 'refusal' && typeof block.refusal === 'string') {
          textParts.push(block.refusal);
        }
      });
    });

    const incompleteReason = response.incomplete_details && response.incomplete_details.reason;
    const finishReason = response.status === 'incomplete' && incompleteReason === 'max_output_tokens'
      ? 'length'
      : (response.status || 'stop');

    return {
      text: textParts.join(''),
      finishReason: finishReason
    };
  }

  function extractAnthropicMessages(response) {
    if (!response || !Array.isArray(response.content)) {
      throw new Error('The Anthropic response did not contain a content array.');
    }
    const text = response.content.filter(function(block) {
      return block && block.type === 'text' && typeof block.text === 'string';
    }).map(function(block) {
      return block.text;
    }).join('');

    return {
      text: text,
      finishReason: response.stop_reason === 'max_tokens' ? 'length' : (response.stop_reason || 'stop')
    };
  }

  function extractResponse(endpoint, responseText) {
    const response = parseJSONResponse(responseText);
    if (response && response.error) {
      const error = new Error(response.error.message || 'The API returned an error.');
      error.apiError = response.error;
      throw error;
    }

    const protocol = detectProtocol(endpoint);
    if (protocol === 'anthropic_messages') return extractAnthropicMessages(response);
    if (protocol === 'openai_responses') return extractOpenAIResponses(response);
    return extractOpenAIChat(response);
  }

  function compactErrorText(value, maxLength) {
    const limit = Number(maxLength) > 0 ? Number(maxLength) : 1600;
    const text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    if (text.length <= limit) return text;
    return text.slice(0, limit - 1) + '…';
  }

  function firstErrorMessage(value) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
      return value.map(firstErrorMessage).filter(Boolean).join('; ');
    }
    if (typeof value === 'object') {
      if (typeof value.message === 'string') return value.message;
      if (typeof value.detail === 'string') return value.detail;
      if (typeof value.msg === 'string') return value.msg;
    }
    return '';
  }

  function extractError(responseText) {
    let response = null;
    try {
      response = parseJSONResponse(responseText);
    } catch (error) {
      return {
        code: '',
        type: '',
        param: '',
        message: compactErrorText(responseText),
        requestId: '',
        rawIsJson: false
      };
    }

    const nested = response && typeof response === 'object' && response.error && typeof response.error === 'object'
      ? response.error
      : null;
    const source = nested || (response && typeof response === 'object' ? response : {});
    let message = firstErrorMessage(source.message) ||
      firstErrorMessage(source.detail) ||
      firstErrorMessage(source.errors) ||
      firstErrorMessage(response && response.message) ||
      firstErrorMessage(response && response.detail) ||
      firstErrorMessage(response && response.errors);

    if (!message && source && Object.keys(source).length) {
      try { message = JSON.stringify(source); } catch (error) { message = ''; }
    }

    return {
      code: compactErrorText(source.code || source.error_code || '', 200),
      type: compactErrorText(source.type || (response && response.type) || '', 200),
      param: compactErrorText(source.param || source.parameter || source.field || '', 300),
      message: compactErrorText(message || responseText),
      requestId: compactErrorText(
        source.request_id || source.requestId ||
        (response && (response.request_id || response.requestId)) || '',
        300
      ),
      rawIsJson: true
    };
  }

  function getErrorHint(errorInfo, context) {
    const info = errorInfo || {};
    const meta = context || {};
    const status = Number(meta.status || 0);
    const haystack = [info.code, info.type, info.param, info.message].filter(Boolean).join(' ').toLowerCase();

    if (/reasoning(_effort)?|reasoning[ .-]?effort/.test(haystack)) {
      return 'Set Reasoning Effort to Auto, or choose one of the values the provider says this model supports.';
    }
    if (/verbosity/.test(haystack)) {
      return 'Set Verbosity to Auto, or choose a value supported by this model.';
    }
    if (/temperature/.test(haystack)) {
      return 'Set Temperature to Auto/blank, especially when using a reasoning model.';
    }
    if (/max_(output_)?tokens|max_completion_tokens|max tokens|token cap/.test(haystack)) {
      return 'Clear Max Output Tokens or choose a value accepted by this model/provider.';
    }
    if (/json_schema|response_format|text\.format|structured output|schema/.test(haystack)) {
      return 'Check the JSON Schema and structured-output settings, or turn JSON off for this prompt.';
    }
    if (/model_not_found|unknown model|model .*not (found|exist)|does not exist|no such model/.test(haystack)) {
      return 'Check the Model value and confirm that this API key has access to it.';
    }
    if (/unsupported (parameter|value)|invalid (parameter|value)|unknown parameter|extra_forbidden/.test(haystack)) {
      return info.param
        ? 'The provider rejected `' + info.param + '`. Set that control to Auto/blank or choose a supported value.'
        : 'The provider rejected one of the request settings. Set optional advanced controls to Auto/blank and retry.';
    }
    if (status === 401 || /authentication|invalid api key|incorrect api key|unauthorized/.test(haystack)) {
      return 'Check the API key saved for this exact endpoint.';
    }
    if (status === 403 || /permission|forbidden|access denied/.test(haystack)) {
      return 'The key was recognized but may not have permission for this model, project, or endpoint.';
    }
    if (status === 404) {
      return 'Check both the endpoint URL and model name. Some providers also return 404 when the key lacks model access.';
    }
    if (status === 429 || /rate.?limit|quota|too many requests/.test(haystack)) {
      return 'The provider is rate-limiting the request or the account has reached a quota. Retry later or check provider usage limits.';
    }
    if (status >= 500) {
      return 'The provider returned a server error. Retrying later may succeed without changing your prompt settings.';
    }
    if (status === 400 || status === 422) {
      return 'The provider rejected the request. The message/parameter above should identify which prompt setting needs to change.';
    }
    return '';
  }

  root.LitApiAdapters = {
    ANTHROPIC_VERSION: ANTHROPIC_VERSION,
    detectProtocol: detectProtocol,
    getCapabilities: getCapabilities,
    buildRequest: buildRequest,
    extractResponse: extractResponse,
    extractError: extractError,
    getErrorHint: getErrorHint,
    _test: {
      endpointPath: endpointPath,
      endpointHostname: endpointHostname,
      isAnthropicDirectHost: isAnthropicDirectHost,
      isOpenAIDirectHost: isOpenAIDirectHost,
      isGPT5Family: isGPT5Family,
      isOpenAIOSeries: isOpenAIOSeries,
      isKnownOpenAINonReasoningFamily: isKnownOpenAINonReasoningFamily,
      classifyOpenAIModel: classifyOpenAIModel,
      isOpenAIReasoningFamily: isOpenAIReasoningFamily,
      normalizeAnthropicMessages: normalizeAnthropicMessages,
      normalizeOpenAIMessages: normalizeOpenAIMessages,
      optionalNumber: optionalNumber,
      parseSchema: parseSchema,
      compactErrorText: compactErrorText,
      firstErrorMessage: firstErrorMessage
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
