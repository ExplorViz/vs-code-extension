import * as vscode from 'vscode';



type SpanData = {
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  name: string;
  startTime?: number; // ms
  endTime?: number; // ms
  attributes?: { [key: string]: any };
};

const out = vscode.window.createOutputChannel('ExplorViz Traces');

export function logSpan(span: SpanData) {
  const s = {
    traceId: span.traceId || null,
    spanId: span.spanId || null,
    parentSpanId: span.parentSpanId || null,
    name: span.name,
    startTime: span.startTime ? new Date(span.startTime).toISOString() : null,
    endTime: span.endTime ? new Date(span.endTime).toISOString() : null,
    attributes: span.attributes || {},
  };
  const line = JSON.stringify(s, null, 2);
  console.log('[ExplorViz Trace] ', line);
  out.appendLine(line);
}

export function exportTraceBundle(bundle: any) {
  // If SDK tracer is available, use it to create and export spans (matches send-test.ts behaviour)
  if (tracer) {
    (async () => {
      try {
        // Group spans by traceId to ensure all spans in a trace share the same trace ID
        // and create them in parent-first order using the API context to attach parents.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const api = require('@opentelemetry/api');

        const spanEntries: Array<{ s: any; resourceAttrs: any }> = [];
        const extractOtlpValue = (maybeAny: any) => {
          if (maybeAny === null || maybeAny === undefined) return '';
          if (typeof maybeAny !== 'object') return maybeAny;
          if ('stringValue' in maybeAny) return maybeAny.stringValue;
          if ('string_value' in maybeAny) return maybeAny.string_value;
          if ('boolValue' in maybeAny) return maybeAny.boolValue;
          if ('bool_value' in maybeAny) return maybeAny.bool_value;
          if ('intValue' in maybeAny) return maybeAny.intValue;
          if ('int_value' in maybeAny) return maybeAny.int_value;
          if ('doubleValue' in maybeAny) return maybeAny.doubleValue;
          if ('double_value' in maybeAny) return maybeAny.double_value;
          try { return JSON.stringify(maybeAny); } catch (e) { return String(maybeAny); }
        };
        const normalizeId = (id?: string) => {
          if (!id) return '';
          let v = String(id).trim();
          if (v.startsWith('0x') || v.startsWith('0X')) v = v.slice(2);
          v = v.replace(/[^0-9a-fA-F]/g, '').toLowerCase();
          return v;
        };

        for (const rs of (bundle.resourceSpans || [])) {
          const resourceAttrs = (rs.resource?.attributes || []).reduce((acc: any, a: any) => {
            try { acc[String(a.key)] = extractOtlpValue(a.value); } catch (e) {}
            return acc;
          }, {});

          for (const ss of (rs.scopeSpans || [])) {
            for (const s of (ss.spans || [])) {
              spanEntries.push({ s, resourceAttrs });
            }
          }
        }

        // Group spans by their original traceId so they stay together
        const traceGroups: Map<string, Array<{ s: any; resourceAttrs: any }>> = new Map();
        for (const entry of spanEntries) {
          const traceId = normalizeId(entry.s.traceId);
          if (!traceGroups.has(traceId)) {
            traceGroups.set(traceId, []);
          }
          traceGroups.get(traceId)!.push(entry);
        }

        // Process each trace group - all spans in a group will share the same SDK-generated trace ID
        for (const [_traceId, entries] of traceGroups) {
          const spanMap: { [id: string]: any } = {};
          // Maps original spanId -> SDK span so we can link parent-child within this trace
          const traceRootContext: { ctx: any } = { ctx: null };
          
          let remaining = entries.slice();
          let progress = true;
          while (remaining.length && progress) {
            progress = false;
            const next: typeof remaining = [];
            for (const entry of remaining) {
              const s = entry.s;
              const parentNorm = normalizeId(s.parentSpanId);
              // Wait for parent to be created first (unless it's a root span)
              if (parentNorm && !spanMap[parentNorm]) {
                next.push(entry);
                continue;
              }

              try {
                const spanOpts: any = {};
                if (s.startTime) spanOpts.startTime = new Date(s.startTime);

                let spanInst: any = null;
                let contextToUse = api.context.active();

                if (parentNorm && spanMap[parentNorm]) {
                  // Child span - use parent span context
                  contextToUse = api.trace.setSpan(api.context.active(), spanMap[parentNorm]);
                } else if (traceRootContext.ctx) {
                  // No parent but we have a trace root - use it to stay in same trace
                  contextToUse = traceRootContext.ctx;
                }

                spanInst = tracer.startSpan(s.name || 'span', spanOpts, contextToUse);

                // Save first root span context so all other root spans in this trace group share the same trace
                if (!parentNorm && !traceRootContext.ctx) {
                  traceRootContext.ctx = api.trace.setSpan(api.context.active(), spanInst);
                }

                // Apply resource attributes and extraTags first, then span attributes so span-level attrs win
                for (const k of Object.keys(entry.resourceAttrs || {})) {
                  try { spanInst.setAttribute(k, (entry.resourceAttrs as any)[k]); } catch (e) {}
                }
                for (const k of Object.keys(extraTags || {})) {
                  try { spanInst.setAttribute(k, (extraTags as any)[k]); } catch (e) {}
                }
                for (const a of (s.attributes || [])) {
                  try {
                    const val = a && a.value !== undefined ? extractOtlpValue(a.value) : undefined;
                    spanInst.setAttribute(String(a.key), val);
                  } catch (e) {}
                }

                // Set span status if provided (OTLP status: {code: 0=UNSET, 1=OK, 2=ERROR, message?})
                if (s.status) {
                  try {
                    const statusCode = s.status.code ?? 0;
                    const statusMessage = s.status.message ?? '';
                    if (statusCode === 2) {
                      spanInst.setStatus({ code: api.SpanStatusCode.ERROR, message: statusMessage });
                    } else if (statusCode === 1) {
                      spanInst.setStatus({ code: api.SpanStatusCode.OK });
                    }
                  } catch (e) {}
                }

                if (s.endTime) spanInst.end(s.endTime);
                else spanInst.end();

                const spanIdNorm = normalizeId(s.spanId);
                if (spanIdNorm) spanMap[spanIdNorm] = spanInst;
                progress = true;
              } catch (e) {
                out.appendLine('[ExplorViz] failed to create span via SDK: ' + String(e));
              }
            }
            remaining = next;
          }

          // Handle any orphan spans (parent not found) - create them under trace root
          if (remaining.length > 0) {
            out.appendLine(`[ExplorViz] ${remaining.length} spans had unresolved parents; attaching to trace root`);
            for (const entry of remaining) {
              const s = entry.s;
              try {
                const spanOpts: any = {};
                if (s.startTime) spanOpts.startTime = new Date(s.startTime);
                const contextToUse = traceRootContext.ctx || api.context.active();
                const spanInst = tracer.startSpan(s.name || 'span', spanOpts, contextToUse);
                for (const k of Object.keys(entry.resourceAttrs || {})) {
                  try { spanInst.setAttribute(k, (entry.resourceAttrs as any)[k]); } catch (e) {}
                }
                for (const k of Object.keys(extraTags || {})) {
                  try { spanInst.setAttribute(k, (extraTags as any)[k]); } catch (e) {}
                }
                for (const a of (s.attributes || [])) {
                  try {
                    const val = a && a.value !== undefined ? extractOtlpValue(a.value) : undefined;
                    spanInst.setAttribute(String(a.key), val);
                  } catch (e) {}
                }
                if (s.status) {
                  try {
                    const statusCode = s.status.code ?? 0;
                    const statusMessage = s.status.message ?? '';
                    if (statusCode === 2) {
                      spanInst.setStatus({ code: api.SpanStatusCode.ERROR, message: statusMessage });
                    } else if (statusCode === 1) {
                      spanInst.setStatus({ code: api.SpanStatusCode.OK });
                    }
                  } catch (e) {}
                }
                if (s.endTime) spanInst.end(s.endTime); else spanInst.end();
              } catch (e) {
                out.appendLine('[ExplorViz] fallback span creation failed: ' + String(e));
              }
            }
          }
        }

        if (provider && typeof provider.forceFlush === 'function') {
          try { await provider.forceFlush(); } catch (e) { out.appendLine('[ExplorViz] provider.forceFlush failed: ' + String(e)); }
        }
        out.appendLine(`[ExplorViz] exported ${spanEntries.length} spans in ${traceGroups.size} traces via SDK OTLP exporter`);
        return;
      } catch (e) {
        out.appendLine('[ExplorViz] SDK export failed: ' + String(e));
      }
    })();
    return;
  }

}



let provider: any = null;
let tracer: any = null;
let exporterInstance: any = null;
const extraTags: { [k: string]: any } = {
  'service.name': 'spring-petclinic',
  'service.instance.id': '0',
  'telemetry.sdk.language': 'java',
  'application_name': 'spring-petclinic',
  'application_instance_id': 0,
  'application_language': 'java',
};

/**
 * Update token/secret values used as extra tags for SDK-based exports.
 * Call this when the extension knows the landscape token/secret from the backend.
 */
export function setExporterTokenSecret(token?: string | null, secret?: string | null) {
  if (token) {
    extraTags['explorviz.token.id'] = token;
    extraTags['landscape_token'] = token;
  } else {
    delete extraTags['explorviz.token.id'];
    delete extraTags['landscape_token'];
  }

  if (secret) {
    extraTags['explorviz.token.secret'] = secret;
    extraTags['token_secret'] = secret;
  } else {
    delete extraTags['explorviz.token.secret'];
    delete extraTags['token_secret'];
  }
  out.appendLine(`[ExplorViz] updated exporter tokens id=${token ? token : 'null'} secret=${secret ? secret : 'null'}`);
}

/**
 * Set the service name for all exported spans.
 * Call this before starting tracing to customize the service identity.
 */
export function setExporterServiceName(serviceName: string) {
  if (serviceName) {
    extraTags['service.name'] = serviceName;
    extraTags['application_name'] = serviceName;
    out.appendLine(`[ExplorViz] updated exporter service.name=${serviceName}`);
  }
}

export function initExporter(collectorUrl: string) {
  try {
    out.appendLine('[ExplorViz] initExporter: checking module resolution for optional OTLP SDK packages');
    try {
      out.appendLine('[ExplorViz] resolve @opentelemetry/sdk-trace-node -> ' + require.resolve('@opentelemetry/sdk-trace-node'));
    } catch (e) {
      out.appendLine('[ExplorViz] resolve @opentelemetry/sdk-trace-node failed: ' + String((e as any).message));
    }
    try {
      out.appendLine('[ExplorViz] resolve @opentelemetry/exporter-collector-grpc -> ' + require.resolve('@opentelemetry/exporter-collector-grpc'));
    } catch (e) {
      out.appendLine('[ExplorViz] resolve @opentelemetry/exporter-collector-grpc failed: ' + String((e as any).message));
    }
    try {
      out.appendLine('[ExplorViz] resolve @opentelemetry/sdk-trace-base -> ' + require.resolve('@opentelemetry/sdk-trace-base'));
    } catch (e) {
      out.appendLine('[ExplorViz] resolve @opentelemetry/sdk-trace-base failed: ' + String((e as any).message));
    }
   const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { BatchSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-grpc');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');

    // create provider with a service resource.
    // Align provider service name with `extraTags['service.name']` when available
    // so that SDK-created spans inherit the same Resource as OTLP bundles.
    const providerServiceName = extraTags['service.name'] || 'explorviz-vscode-extension';
    provider = new NodeTracerProvider({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: providerServiceName,
      }),
    });

    // ensure grpc credentials available for OTLP exporter
    let grpcForSdk: any = null;
    try {
      grpcForSdk = require('@grpc/grpc-js');
    } catch (e) {
      grpcForSdk = null;
    }

    const exporterOpts: any = {};
    // If a collectorUrl looks like host:port or grpc://host:port, pass it through
    if (collectorUrl) exporterOpts.url = collectorUrl.replace(/^grpc:\/\//, '');
    if (grpcForSdk && grpcForSdk.credentials && !exporterOpts.credentials) {
      exporterOpts.credentials = grpcForSdk.credentials.createInsecure();
    }

    exporterInstance = new OTLPTraceExporter(exporterOpts);
    if (typeof provider.addSpanProcessor === 'function') {
      // Use BatchSpanProcessor with a very long delay so spans accumulate in
      // memory and are only exported when forceFlush() is called. This ensures
      // all spans for a trace are sent together in a single gRPC call, avoiding
      // "sending queue is full" errors from individual span exports.
      provider.addSpanProcessor(new BatchSpanProcessor(exporterInstance, {
        maxExportBatchSize: 512,
        scheduledDelayMillis: 30_000, // fallback auto-flush; forceFlush() sends everything immediately
        maxQueueSize: 2048,
      }));
    } else {
      out.appendLine('[ExplorViz] provider.addSpanProcessor is not a function; skipping SDK span processor attach');
    }
    if (typeof provider.register === 'function') {
      provider.register();
    }
    try {
      tracer = provider.getTracer ? provider.getTracer('explorviz-debug-tracer') : null;
    } catch (e) {
      tracer = null;
      out.appendLine('[ExplorViz] provider.getTracer failed: ' + String(e));
    }
    console.log('[ExplorViz] OTLP gRPC exporter initialized for', collectorUrl);
    out.appendLine(`[ExplorViz] OTLP gRPC exporter initialized for ${collectorUrl}`);
  } catch (err) {
    console.log('[ExplorViz] OTLP exporter not initialized (missing packages); falling back to logging', err);
    out.appendLine('[ExplorViz] OTLP exporter not initialized (missing packages); falling back to logging');
    out.appendLine('[ExplorViz] initExporter error: ' + String(err));
    if (err && (err as any).stack) out.appendLine((err as any).stack);
    provider = null;
    tracer = null;
    exporterInstance = null;
  }
}




export function disposeExporter() {
  // keep existing dispose responsibilities in case provider exists
  out.appendLine('[ExplorViz] disposing exporter');
  if (provider && typeof provider.shutdown === 'function') {
    try {
      provider.shutdown().catch((err: any) => console.warn('provider.shutdown error', err));
    } catch (e) {
      // ignore
    }
  }
  provider = null;
  tracer = null;
  exporterInstance = null;
}
