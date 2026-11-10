import { useState } from 'react';
import { App as AntApp, Button, Popover, Skeleton, Tag } from 'antd';
import { BranchesOutlined } from '@ant-design/icons';
import { api, ApiError } from '../api';
import type { BranchSummary } from '../types';

interface Props {
  chatId: string;
  activeLeafId: string | null;
  onSwitched: () => Promise<void> | void;
}

export function BranchSwitcher({ chatId, activeLeafId, onSwitched }: Props) {
  const { message } = AntApp.useApp();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.chats.branches(chatId);
      setBranches(result.branches);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '分支加载失败');
    } finally {
      setLoading(false);
    }
  };

  const switchTo = async (branch: BranchSummary) => {
    if (branch.id === activeLeafId) {
      setOpen(false);
      return;
    }
    try {
      await api.chats.switchBranch(chatId, branch.id);
      setOpen(false);
      await onSwitched();
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : '切换分支失败');
    }
  };

  const content = (
    <div className="branch-popover">
      <div className="suggestion-popover-head">
        <span className="muted">{branches.length} 个分支 · 点选切换</span>
      </div>
      {loading ? (
        <Skeleton active title={false} paragraph={{ rows: 3 }} />
      ) : error ? (
        <div className="muted">{error}</div>
      ) : branches.length === 0 ? (
        <div className="muted">还没有分支</div>
      ) : (
        <div className="branch-options">
          {branches.map((branch) => (
            <button
              key={branch.id}
              type="button"
              className={`branch-option ${branch.id === activeLeafId ? 'active' : ''}`}
              onClick={() => void switchTo(branch)}
            >
              <span className="branch-role">
                <Tag color={branch.role === 'user' ? 'blue' : 'green'}>
                  {branch.role === 'user' ? '你' : '角色'}
                </Tag>
                {branch.id === activeLeafId && <Tag color="purple">当前</Tag>}
              </span>
              <span className="branch-text">{branch.content.replace(/\s+/g, ' ').slice(0, 120) || '（空消息）'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void load();
      }}
      trigger="click"
      placement="bottomRight"
      title="切换分支"
      content={content}
    >
      <Button icon={<BranchesOutlined />}>分支</Button>
    </Popover>
  );
}
