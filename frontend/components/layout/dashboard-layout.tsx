'use client';

import { useState } from 'react';
import { Header } from './header';
import { Sidebar } from './sidebar';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { ChatPanel, ChatFloatingButton } from '@/components/chat';

export function DashboardLayout({ children }: { children: React.ReactNode }) {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
        <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
            <Header onMenuClick={() => setSidebarOpen(true)}/>

            <div className="flex flex-1 overflow-hidden">
                <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)}/>

                <main className="flex-1 overflow-y-auto flex flex-col">
                    <div className="px-3 lg:px-4 flex-shrink-0">
                        <Breadcrumb />
                    </div>
                    <div className="flex-1 min-h-0 px-6 lg:px-8">
                        {children}
                    </div>
                </main>
            </div>

            {/* AI Chat */}
            <ChatPanel />
            <ChatFloatingButton />
        </div>
    );
}