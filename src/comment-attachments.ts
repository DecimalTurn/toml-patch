import {
  Comment,
  Document,
  InlineArray,
  InlineTable,
  Table,
  TableArray,
  TreeNode,
  isComment,
  isInlineArray,
  isInlineItem,
  isInlineTable,
  isKeyValue,
  isTable,
  isTableArray
} from './cst';
import {
  findHostContainer,
  isCommentedOutEntry,
  resolveInlineElementSlots,
  resolveSlots,
  Slot
} from './comment-ownership';

export type CommentAttachmentKind = 'leading' | 'trailing' | 'header' | 'unattached';

export interface CommentAttachment {
  comment: Comment;
  kind: CommentAttachmentKind;
  owner?: TreeNode;
}

/**
 * Resolves comment relationships for a parsed CST.
 *
 * Leading comments are adjacent own-line comments before an entry. Trailing
 * comments are on the entry's ending line. Header comments follow a table
 * header on the same line. Blank-line-separated and otherwise unowned comments
 * are returned as `unattached`.
 *
 * Comments inside multiline inline arrays and tables are associated with their
 * nearest inline item, even though the parser stores those comments in the
 * enclosing document or table.
 */
export function getCommentAttachments(document: Document): CommentAttachment[] {
  const attachments = new Map<Comment, CommentAttachment>();

  function setAttachment(
    comment: Comment,
    kind: CommentAttachmentKind,
    owner?: TreeNode
  ) {
    attachments.set(comment, owner ? { comment, kind, owner } : { comment, kind });
  }

  function setSlotAttachments(slot: Slot, container: Document | Table | TableArray) {
    const comments = slot.items.filter(isComment);

    if (slot.kind === 'member' && slot.member) {
      for (const comment of comments) {
        setAttachment(
          comment,
          comment.loc.start.line < slot.member.loc.start.line ? 'leading' : 'trailing',
          slot.member
        );
      }
      return;
    }

    for (const comment of comments) {
      if (
        (isTable(container) || isTableArray(container)) &&
        comment.loc.start.line === container.key.loc.end.line
      ) {
        setAttachment(comment, 'header', container);
      } else {
        setAttachment(comment, 'unattached');
      }
    }
  }

  function setContainerAttachments(container: Document | Table | TableArray) {
    for (const slot of resolveSlots(container)) {
      setSlotAttachments(slot, container);
    }
  }

  function setInlineAttachments(container: InlineArray | InlineTable) {
    if (container.loc.end.line <= container.loc.start.line) return;

    const host = findHostContainer(document, container);
    if (!host) return;

    for (const slot of resolveInlineElementSlots(container, host.items as TreeNode[])) {
      const comments = slot.items.filter(
        (item): item is Comment => isComment(item) && isWithin(item, container)
      );
      if (slot.kind !== 'member' || !slot.member) {
        for (const comment of comments) {
          setAttachment(comment, 'unattached');
        }
        continue;
      }

      for (const comment of comments) {
        setAttachment(
          comment,
          comment.loc.start.line < slot.member.loc.start.line ? 'leading' : 'trailing',
          slot.member
        );
      }
    }
  }

  function visitValue(node: TreeNode) {
    if (isKeyValue(node)) {
      visitValue(node.value);
      return;
    }

    if (isInlineArray(node) || isInlineTable(node)) {
      setInlineAttachments(node);
      for (const item of node.items) {
        if (isInlineItem(item)) visitValue(item.item);
      }
    }
  }

  setContainerAttachments(document);

  for (const block of document.items) {
    if (isTable(block) || isTableArray(block)) {
      setContainerAttachments(block);
      for (const item of block.items) {
        if (isKeyValue(item)) visitValue(item.value);
      }
    } else if (isKeyValue(block)) {
      visitValue(block.value);
    }
  }

  reassignSectionComments(document, setAttachment);

  return [...attachments.values()].sort(compareComments);
}

function reassignSectionComments(
  document: Document,
  setAttachment: (comment: Comment, kind: CommentAttachmentKind, owner?: TreeNode) => void
) {
  for (let index = 0; index < document.items.length - 1; index++) {
    const block = document.items[index];
    const nextBlock = document.items[index + 1];
    if ((!isTable(block) && !isTableArray(block)) || (!isTable(nextBlock) && !isTableArray(nextBlock))) {
      continue;
    }

    const lastSlot = resolveSlots(block).at(-1);
    if (!lastSlot || lastSlot.kind !== 'pinned') continue;
    if (lastSlot.startLine <= block.key.loc.end.line) continue;
    if (lastSlot.endLine + 1 !== nextBlock.loc.start.line) continue;

    const comments = lastSlot.items.filter(isComment);
    if (comments.length === 0 || comments.every(isCommentedOutEntry)) continue;

    for (const comment of comments) {
      setAttachment(comment, 'leading', nextBlock);
    }
  }
}

function isWithin(comment: Comment, container: InlineArray | InlineTable): boolean {
  return (
    comparePositions(container.loc.start, comment.loc.start) <= 0 &&
    comparePositions(comment.loc.end, container.loc.end) <= 0
  );
}

function compareComments(left: CommentAttachment, right: CommentAttachment): number {
  return comparePositions(left.comment.loc.start, right.comment.loc.start);
}

function comparePositions(
  left: { line: number; column: number },
  right: { line: number; column: number }
): number {
  return left.line - right.line || left.column - right.column;
}
