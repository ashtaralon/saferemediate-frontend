"""
Batch restyle script: converts old Tailwind light-mode classes to CSS variable style.
Usage: python3 scripts/restyle.py components/MyComponent.tsx
"""
import sys
import re

def restyle(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    original = content

    # ============================================================
    # SIMPLE CLASS REPLACEMENTS (inside className strings)
    # ============================================================

    # Backgrounds
    content = content.replace('bg-white', 'bg-[var(--card,#ffffff)]')
    content = content.replace('bg-gray-50', 'bg-[var(--background,#f8f9fa)]')
    content = content.replace('bg-gray-100', 'bg-[var(--background,#f3f4f6)]')

    # Text colors
    content = content.replace('text-gray-900', 'text-[var(--foreground,#111827)]')
    content = content.replace('text-gray-800', 'text-[var(--foreground,#1f2937)]')
    content = content.replace('text-gray-700', 'text-[var(--foreground,#374151)]')
    content = content.replace('text-gray-600', 'text-[var(--muted-foreground,#4b5563)]')
    content = content.replace('text-gray-500', 'text-[var(--muted-foreground,#6b7280)]')
    content = content.replace('text-gray-400', 'text-[var(--muted-foreground,#9ca3af)]')

    # Borders
    content = content.replace('border-gray-200', 'border-[var(--border,#e5e7eb)]')
    content = content.replace('border-gray-300', 'border-[var(--border,#d1d5db)]')
    content = content.replace('border-gray-100', 'border-[var(--border,#f3f4f6)]')

    # Hover states
    content = content.replace('hover:bg-gray-50', 'hover:bg-[var(--background,#f8f9fa)]')
    content = content.replace('hover:bg-gray-100', 'hover:bg-[var(--background,#f3f4f6)]')
    content = content.replace('hover:text-gray-600', 'hover:text-[var(--muted-foreground,#4b5563)]')
    content = content.replace('hover:text-gray-700', 'hover:text-[var(--foreground,#374151)]')
    content = content.replace('hover:text-gray-900', 'hover:text-[var(--foreground,#111827)]')

    # Indigo -> Purple (#8b5cf6)
    content = content.replace('bg-indigo-600', 'bg-[#8b5cf6]')
    content = content.replace('bg-indigo-700', 'bg-[#7c3aed]')
    content = content.replace('bg-indigo-500', 'bg-[#8b5cf6]')
    content = content.replace('bg-indigo-400', 'bg-[#a78bfa]')
    content = content.replace('bg-indigo-100', 'bg-[#8b5cf615]')
    content = content.replace('bg-indigo-50', 'bg-[#8b5cf610]')
    content = content.replace('text-indigo-600', 'text-[#8b5cf6]')
    content = content.replace('text-indigo-700', 'text-[#7c3aed]')
    content = content.replace('text-indigo-900', 'text-[#8b5cf6]')
    content = content.replace('text-indigo-500', 'text-[#8b5cf6]')
    content = content.replace('border-indigo-200', 'border-[#8b5cf640]')
    content = content.replace('border-indigo-300', 'border-[#8b5cf640]')
    content = content.replace('hover:bg-indigo-700', 'hover:opacity-90')
    content = content.replace('hover:bg-indigo-600', 'hover:opacity-90')

    # Purple button variants
    content = content.replace('bg-purple-600', 'bg-[#8b5cf6]')
    content = content.replace('bg-purple-700', 'bg-[#7c3aed]')
    content = content.replace('bg-purple-500', 'bg-[#8b5cf6]')
    content = content.replace('bg-purple-100', 'bg-[#8b5cf615]')
    content = content.replace('bg-purple-50', 'bg-[#8b5cf610]')
    content = content.replace('text-purple-600', 'text-[#8b5cf6]')
    content = content.replace('text-purple-700', 'text-[#7c3aed]')
    content = content.replace('hover:bg-purple-700', 'hover:opacity-90')

    # Semantic color standardization
    content = content.replace('bg-red-50', 'bg-[#ef444410]')
    content = content.replace('bg-red-100', 'bg-[#ef444420]')
    content = content.replace('border-red-200', 'border-[#ef444440]')
    content = content.replace('border-red-300', 'border-[#ef444440]')
    content = content.replace('text-red-800', 'text-[#ef4444]')
    content = content.replace('text-red-700', 'text-[#ef4444]')
    content = content.replace('text-red-600', 'text-[#ef4444]')
    content = content.replace('text-red-500', 'text-[#ef4444]')

    content = content.replace('bg-green-50', 'bg-[#22c55e10]')
    content = content.replace('bg-green-100', 'bg-[#22c55e20]')
    content = content.replace('border-green-200', 'border-[#22c55e40]')
    content = content.replace('border-green-300', 'border-[#22c55e40]')
    content = content.replace('text-green-800', 'text-[#22c55e]')
    content = content.replace('text-green-700', 'text-[#22c55e]')
    content = content.replace('text-green-600', 'text-[#22c55e]')
    content = content.replace('text-green-500', 'text-[#22c55e]')

    content = content.replace('bg-amber-50', 'bg-[#f9731610]')
    content = content.replace('bg-amber-100', 'bg-[#f9731620]')
    content = content.replace('border-amber-200', 'border-[#f9731640]')
    content = content.replace('border-amber-300', 'border-[#f9731640]')
    content = content.replace('border-amber-400', 'border-[#f9731680]')
    content = content.replace('text-amber-800', 'text-[#f97316]')
    content = content.replace('text-amber-700', 'text-[#f97316]')
    content = content.replace('text-amber-600', 'text-[#f97316]')

    content = content.replace('bg-orange-50', 'bg-[#f9731610]')
    content = content.replace('bg-orange-100', 'bg-[#f9731620]')
    content = content.replace('border-orange-200', 'border-[#f9731640]')
    content = content.replace('text-orange-800', 'text-[#f97316]')
    content = content.replace('text-orange-700', 'text-[#f97316]')

    content = content.replace('bg-blue-50', 'bg-[#3b82f610]')
    content = content.replace('bg-blue-100', 'bg-[#3b82f620]')
    content = content.replace('border-blue-200', 'border-[#3b82f640]')
    content = content.replace('border-blue-500', 'border-[#3b82f6]')
    content = content.replace('text-blue-800', 'text-[#3b82f6]')
    content = content.replace('text-blue-700', 'text-[#3b82f6]')
    content = content.replace('text-blue-600', 'text-[#3b82f6]')

    content = content.replace('bg-emerald-50', 'bg-[#10b98110]')
    content = content.replace('bg-emerald-100', 'bg-[#10b98120]')
    content = content.replace('border-emerald-200', 'border-[#10b98140]')
    content = content.replace('border-emerald-300', 'border-[#10b98140]')
    content = content.replace('text-emerald-700', 'text-[#10b981]')
    content = content.replace('text-emerald-600', 'text-[#10b981]')

    content = content.replace('bg-yellow-50', 'bg-[#eab30810]')
    content = content.replace('bg-yellow-100', 'bg-[#eab30820]')
    content = content.replace('border-yellow-200', 'border-[#eab30840]')
    content = content.replace('text-yellow-800', 'text-[#eab308]')
    content = content.replace('text-yellow-700', 'text-[#eab308]')

    # Gradients → flat
    content = re.sub(r'bg-gradient-to-r from-\S+ to-\S+', 'bg-[var(--card,#ffffff)]', content)

    # Ring colors
    content = content.replace('ring-purple-500', 'ring-[#8b5cf6]')
    content = content.replace('ring-2 ring-purple-500', 'ring-2 ring-[#8b5cf6]')

    # Focus rings
    content = content.replace('focus:ring-blue-500', 'focus:ring-[#8b5cf6]')
    content = content.replace('focus:border-blue-500', 'focus:border-[#8b5cf6]')
    content = content.replace('focus:ring-red-500', 'focus:ring-[#ef4444]')

    # Shadow standardization
    content = content.replace('shadow-sm', 'shadow-sm')  # keep as-is
    content = content.replace('shadow-2xl', 'shadow-2xl')

    changes = content != original
    with open(filepath, 'w') as f:
        f.write(content)

    # Count remaining
    import subprocess
    result = subprocess.run(
        ['grep', '-c', r'bg-white\|bg-gray-50\|text-gray-900\|text-gray-500\|border-gray-200\|bg-indigo-\|bg-amber-50\|bg-red-50\|bg-green-50',
         filepath],
        capture_output=True, text=True
    )
    remaining = result.stdout.strip()
    print(f"{'Changed' if changes else 'No changes'} - {remaining} old refs remaining in {filepath}")


if __name__ == '__main__':
    for f in sys.argv[1:]:
        restyle(f)
