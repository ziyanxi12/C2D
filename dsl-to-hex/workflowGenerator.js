'use strict';

const ACTION_TEMPLATES = {
  import_hex: {
    method: 'POST',
    endpoint: '/openapi/files/import',
    contentType: 'multipart/form-data',
    getFields: (params) => ({
      file: '@output.hex',
      name: params.file_name
    }),
    output: { file_id: '$.data.fileId' }
  },
  insert_svg: {
    method: 'POST',
    endpoint: '/openapi/files/{{import_hex.file_id}}/nodes/replace-asset',
    contentType: 'multipart/form-data',
    getFields: (params) => ({
      file: `@${params.file}`,
      nodeId: params.node_id,
      type: 'svg'
    })
  },
  insert_image: {
    method: 'POST',
    endpoint: '/openapi/files/{{import_hex.file_id}}/nodes/replace-asset',
    contentType: 'multipart/form-data',
    getFields: (params) => ({
      file: `@${params.file}`,
      nodeId: params.node_id,
      type: 'image'
    })
  }
};

function idToGuid(id) {
  return String(id).replace(/:/g, '_');
}

function generateWorkflow(dsl, placeholders) {
  const meta = {
    file_name: dsl.meta?.file_name || '未命名',
    generated_at: new Date().toISOString()
  };

  const steps = [];

  const importTemplate = ACTION_TEMPLATES.import_hex;
  steps.push({
    id: 'import_hex',
    order: 1,
    action: 'import_hex',
    description: '导入 hex 文件到 Pixso，获取 file_id',
    file: 'output.hex',
    api: {
      method: importTemplate.method,
      endpoint: importTemplate.endpoint,
      content_type: importTemplate.contentType,
      fields: importTemplate.getFields({ file_name: '{{meta.file_name}}' })
    },
    output: importTemplate.output
  });

placeholders.forEach((p, idx) => {
  const action = p.type === 'svg' ? 'insert_svg' : 'insert_image';
  const template = ACTION_TEMPLATES[action];
  const guid = idToGuid(p.id);
  const ext = p.type === 'svg' ? 'svg' : 'png';
  const file = `${guid}.${ext}`;

  steps.push({
    id: `${action}_${guid}`,
    order: idx + 2,
    action,
    description: `替换节点 ${p.id} 的 ${p.type === 'svg' ? 'SVG' : '图片'} 占位符`,
    depends_on: ['import_hex'],
    file,
    node_id: p.id,
    api: {
      method: template.method,
      endpoint: template.endpoint,
      content_type: template.contentType,
      fields: template.getFields({ file, node_id: p.id })
    }
  });
});

  return {
    version: '1.0.0',
    meta,
    steps
  };
}

module.exports = { generateWorkflow, idToGuid, ACTION_TEMPLATES };