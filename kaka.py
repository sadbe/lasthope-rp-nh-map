#!/usr/bin/env python3
"""
ПОЛНАЯ ЗАЧИСТКА РЕПОЗИТОРИЯ LAST HOPE RP
Удаляет мусор и большие файлы из Git-истории
"""

import subprocess
import os
import sys

def run(cmd, check=True, capture=False):
    print(f"\n🔧 {cmd}")
    result = subprocess.run(cmd, shell=True, capture_output=capture, text=True)
    if check and result.returncode != 0:
        print(f"❌ Ошибка: {result.stderr}")
        if not capture:
            sys.exit(1)
    return result

def main():
    print("💣 ПОЛНАЯ ЗАЧИСТКА РЕПОЗИТОРИЯ")
    print("="*70)
    
    # 1. Проверяем что нет незакоммиченных изменений
    result = run("git status --porcelain", capture=True)
    if result.stdout.strip():
        print("\n⚠️ У тебя есть незакоммиченные изменения!")
        print("Сначала закоммить или откати их:")
        print("  git add . && git commit -m 'wip'")
        print("  или")
        print("  git checkout .")
        sys.exit(1)
    
    # 2. Создаём резервную копию (на всякий случай)
    print("\n📦 Создаю резервную ветку backup...")
    run("git branch backup-before-nuke")
    
    # 3. Устанавливаем git-filter-repo (лучший инструмент для чистки истории)
    print("\n📥 Устанавливаю git-filter-repo...")
    run("pip install --user git-filter-repo")
    
    # Добавляем ~/.local/bin в PATH если нужно
    os.environ['PATH'] = os.path.expanduser('~/.local/bin') + ':' + os.environ.get('PATH', '')
    
    # 4. Создаём .gitignore с правилами
    gitignore_content = """# Мусор от ИИ-ассистентов и разработки
*.py
!scripts/*.py
worklog.md
Caddyfile
download/
fix.py
fix_*.py
apply_improvements.py
debug_files.py
nuke_repo.py

# Временные файлы
*.log
dev.log
*.tmp
*.swp
*~
.DS_Store
Thumbs.db

# Node
node_modules/
.next/
.vercel/

# Environment
.env
.env.local
.env.*.local

# IDE
.vscode/
.idea/
*.swp

# Build
dist/
build/
*.tgz

# Prisma
prisma/*.db
prisma/*.db-journal

# Пустые дубликаты
public/data/

# Большие карты (если решите убрать из репо)
# public/assets/map-satellite.jpg
# public/assets/map-satellite.webp
# public/assets/map-satellite-mobile.*
"""
    
    with open('.gitignore', 'w', encoding='utf-8') as f:
        f.write(gitignore_content)
    
    print("✅ Создан .gitignore")
    
    # 5. Удаляем мусорные файлы из текущей рабочей копии
    print("\n🗑️ Удаляю мусор из рабочей копии...")
    files_to_remove = [
        'Caddyfile',
        'worklog.md',
        'ui-fix3.py',
        'apply_improvements.py',
        'fix.py',
        'fix_repo.py',
        'fix_typescript.py',
        'fix_final.py',
        'debug_files.py',
        'download',
        'public/data'
    ]
    
    for f in files_to_remove:
        if os.path.exists(f):
            if os.path.isdir(f):
                subprocess.run(['rm', '-rf', f])
            else:
                subprocess.run(['rm', '-f', f])
            print(f"  ✅ Удалён: {f}")
    
    # 6. Коммитим текущее состояние
    print("\n💾 Коммичу текущее состояние...")
    run("git add -A")
    run("git commit -m 'chore: remove junk files and update .gitignore'", check=False)
    
    # 7. ОЧИЩАЕМ ИСТОРИЮ от мусора и больших файлов
    print("\n💣 ЗАЧИЩАЮ ИСТОРИЮ (это может занять пару минут)...")
    
    # Список путей для удаления из истории
    paths_to_remove = [
        'Caddyfile',
        'worklog.md',
        'ui-fix3.py',
        'apply_improvements.py',
        'fix.py',
        'fix_repo.py',
        'fix_typescript.py',
        'fix_final.py',
        'debug_files.py',
        'download',
        'public/data'
    ]
    
    # Удаляем мусор из истории
    paths_args = ' '.join([f'--invert-paths --path "{p}"' for p in paths_to_remove])
    # git-filter-repo не поддерживает множественные --path через invert-paths
    # Нужно запускать несколько раз или использовать один раз с list
    
    # Создаём файл со списком путей
    with open('/tmp/paths_to_remove.txt', 'w') as f:
        for p in paths_to_remove:
            f.write(f'{p}\n')
    
    # Запускаем filter-repo
    run(f"git filter-repo --paths-from-file /tmp/paths_to_remove.txt --invert-paths --force")
    
    # 8. Удаляем большие файлы карт из истории (но оставляем в рабочей копии)
    print("\n🗺️ Удаляю большие карты из истории (файлы останутся)...")
    
    # Сначала убеждаемся что карты есть в рабочей копии
    if not os.path.exists('public/assets/map-satellite.jpg'):
        print("⚠️ map-satellite.jpg не найден, восстанавливаю из backup...")
        run("git checkout backup-before-nuke -- public/assets/map-satellite.jpg")
    
    if not os.path.exists('public/assets/map-satellite.webp'):
        print("⚠️ map-satellite.webp не найден, восстанавливаю из backup...")
        run("git checkout backup-before-nuke -- public/assets/map-satellite.webp")
    
    # Удаляем карты из истории
    run('git filter-repo --path "public/assets/map-satellite.jpg" --path "public/assets/map-satellite.webp" --invert-paths --force')
    
    # 9. Коммитим карты заново (теперь они маленькие в истории)
    print("\n📦 Добавляю карты обратно в репозиторий...")
    run("git add public/assets/map-satellite.jpg public/assets/map-satellite.webp")
    run("git commit -m 'feat: add map images (clean history)'")
    
    # 10. Удаляем backup ветку
    print("\n🧹 Удаляю backup ветку...")
    run("git branch -D backup-before-nuke")
    
    # 11. Показываем результат
    print("\n" + "="*70)
    print("✅ ЗАЧИСТКА ЗАВЕРШЕНА!")
    print("="*70)
    
    # Размер репозитория
    result = run("git count-objects -vH", capture=True)
    print(f"\n📊 Новый размер репозитория:")
    print(result.stdout)
    
    print("\n📋 СЛЕДУЮЩИЕ ШАГИ:")
    print("1. Проверь что всё работает:")
    print("   npm install")
    print("   npm run build")
    print("")
    print("2. Если всё ок, FORCE PUSH (это перезапишет историю на GitHub):")
    print("   git push origin main --force")
    print("")
    print("⚠️ ВАЖНО: Если кто-то ещё работал с этим репо, им нужно будет:")
    print("   git fetch origin")
    print("   git reset --hard origin/main")

if __name__ == "__main__":
    main()