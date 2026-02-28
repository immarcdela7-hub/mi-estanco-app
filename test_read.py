import pandas as pd

df = pd.read_excel('Ventas_expendedor Area 700.xlsx', sheet_name='Ventas', header=None)

with open('output_py.txt', 'w', encoding='utf-8') as f:
    f.write("--- SHAPE ---\n")
    f.write(str(df.shape) + "\n")

    f.write("--- FIRST 20 ROWS ---\n")
    for i in range(20):
        f.write(f"ROW {i}:\n")
        row_vals = df.iloc[i].values
        val_list = [str(x).strip() if pd.notna(x) else "" for x in row_vals]
        f.write(str(val_list) + "\n")
