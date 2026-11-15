import {
  getCommentAttachments,
  NodeType,
  parseCst
} from '../index';

describe('public CST API', () => {
  test('parses a document tree while preserving source order and node types', () => {
    const document = parseCst('first = 1\n[section]\nsecond = true\n');

    expect(document.type).toBe(NodeType.Document);
    expect(document.items.map(item => item.type)).toEqual([
      NodeType.KeyValue,
      NodeType.Table
    ]);
  });

  test('exposes leading, trailing, header, inline-item and unattached comments', () => {
    const document = parseCst(`# for a
a = 1 # trailing a
# unattached

[section] # header
# for b
b = [
  # for first
  1, # trailing first
  2
  # trailing array note
]
c = [
  3
] # trailing outer array
`);

    const comments = getCommentAttachments(document);
    const attachmentFor = (raw: string) => comments.find(item => item.comment.raw === raw)!;

    expect(attachmentFor('# for a')).toMatchObject({
      kind: 'leading',
      owner: { type: NodeType.KeyValue }
    });
    expect(attachmentFor('# trailing a')).toMatchObject({
      kind: 'trailing',
      owner: { type: NodeType.KeyValue }
    });
    expect(attachmentFor('# unattached').kind).toBe('unattached');
    expect(attachmentFor('# unattached').owner).toBeUndefined();
    expect(attachmentFor('# header')).toMatchObject({
      kind: 'header',
      owner: { type: NodeType.Table }
    });
    expect(attachmentFor('# for b')).toMatchObject({
      kind: 'leading',
      owner: { type: NodeType.KeyValue }
    });
    expect(attachmentFor('# for first')).toMatchObject({
      kind: 'leading',
      owner: { type: NodeType.InlineItem }
    });
    expect(attachmentFor('# trailing first')).toMatchObject({
      kind: 'trailing',
      owner: { type: NodeType.InlineItem }
    });
    expect(attachmentFor('# trailing array note').kind).toBe('unattached');
    expect(attachmentFor('# trailing array note').owner).toBeUndefined();
    expect(attachmentFor('# trailing outer array')).toMatchObject({
      kind: 'trailing',
      owner: { type: NodeType.KeyValue }
    });
  });

  test('assigns a comment before a table to that table when the parser hoists it into the prior section', () => {
    const document = parseCst(`[first]
value = 1
# for second
[second]
value = 2
`);

    const attachment = getCommentAttachments(document).find(
      item => item.comment.raw === '# for second'
    );

    expect(attachment).toMatchObject({
      kind: 'leading',
      owner: {
        type: NodeType.Table,
        key: { item: { value: ['second'] } }
      }
    });
  });
});
