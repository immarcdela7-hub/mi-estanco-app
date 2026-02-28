import pandas as pd
import unicodedata

def normalize_str(val):
    if pd.isna(val): return ""
    s = str(val).strip().upper()
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')

df_raw = pd.read_excel('Ventas_expendedor Area 700.xlsx', sheet_name='Ventas', header=None)

# Find cabecera
idx_expendeduria = None
idx_referencia = None
indices_actuales = [] 
indice_fila_cabecera = None

for row_idx in range(min(50, len(df_raw))):
    row_values = [normalize_str(x) for x in df_raw.iloc[row_idx].values]
    for col_idx, val in enumerate(row_values):
        if 'EXPENDEDURIA' in val and idx_expendeduria is None:
            idx_expendeduria = col_idx
        if 'REFERENCIA' in val and 'COD' not in val and idx_referencia is None:
            idx_referencia = col_idx
        if val == 'ACTUAL':
            if col_idx not in indices_actuales:
                indices_actuales.append(col_idx)
                indice_fila_cabecera = row_idx

# Cortar y filtrar por LA JONQUERA-001
fila_inicio_datos = indice_fila_cabecera + 1 if indice_fila_cabecera else 14 
df_limpio = pd.DataFrame()
df_limpio['Expendeduria_Cruda'] = df_raw.iloc[fila_inicio_datos:, idx_expendeduria]
df_limpio['Referencia'] = df_raw.iloc[fila_inicio_datos:, idx_referencia]
df_limpio['Expendeduria_Limpia'] = df_limpio['Expendeduria_Cruda'].fillna(method='ffill')

# El primer mes es indices_actuales[0]
if indices_actuales:
    df_limpio['Mes 1'] = df_raw.iloc[fila_inicio_datos:, indices_actuales[0]]

# Filtrar Jonquera
df_calc = df_limpio[df_limpio['Expendeduria_Limpia'].astype(str).str.contains("LA JONQUERA", case=False, na=False)].copy()

# Print results
with open('output_jonquera.txt', 'w', encoding='utf-8') as f:
    for _, row in df_calc.iterrows():
        ref = str(row['Referencia'])
        cant = row['Mes 1']
        if pd.notna(ref) and str(cant).strip() and "DON TOMAS" in ref.upper() and "NICARAGUA" in ref.upper():
            f.write(f"Ref: {ref} | Cantidad Excel (Mes 1): {cant}\n")
