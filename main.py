import pdfplumber
import pandas as pd
import os

def pdf_to_excel(pdf_path):
    # Открываем PDF-файл
    with pdfplumber.open(pdf_path) as pdf:
        # Создаём Excel-файл для записи
        excel_path = pdf_path.replace(".pdf", ".xlsx")
        
        # Создаем пустой список для всех данных
        all_data = []
        
        # Настройки для извлечения таблиц
        table_settings = {
            "vertical_strategy": "lines",
            "horizontal_strategy": "lines"
        }
        
        # Обрабатываем каждую страницу
        for i, page in enumerate(pdf.pages, start=1):
            tables = page.find_tables(table_settings)
            if tables:
                for table in tables:
                    tb = table.extract()
                    # Добавляем данные из таблицы в общий список
                    all_data.extend(tb)
        
        # Находим максимальное количество столбцов
        max_columns = max(len(row) for row in all_data) if all_data else 0
        
        # Выравниваем все строки до максимального количества столбцов
        aligned_data = []
        for row in all_data:
            # Дополняем строку пустыми значениями до максимальной длины
            aligned_row = row + [''] * (max_columns - len(row))
            aligned_data.append(aligned_row)
        
        # Создаем DataFrame из всех данных
        if aligned_data:
            # Используем первую строку как заголовки, остальные как данные
            df = pd.DataFrame(aligned_data[1:], columns=aligned_data[0])
            
            # Сохраняем в один лист Excel
            with pd.ExcelWriter(excel_path, engine='xlsxwriter') as writer:
                df.to_excel(writer, sheet_name='Все данные', index=False)
            
            print(f"Файл успешно сохранён: {excel_path}")
            print(f"Всего строк: {len(df)}")
            print(f"Количество столбцов: {max_columns}")
        else:
            print("В PDF не найдено таблиц")

def find_pdf_in_root():
    # Ищем первый PDF-файл в корневой директории
    for file in os.listdir('.'):
        if file.lower().endswith('.pdf'):
            return file
    return None

if __name__ == "__main__":
    pdf_file = find_pdf_in_root()
    if pdf_file:
        print(f"Найден PDF-файл: {pdf_file}")
        pdf_to_excel(pdf_file)
    else:
        print("В корневой директории не найдено PDF-файлов.")