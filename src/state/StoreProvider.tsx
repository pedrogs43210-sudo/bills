import { createContext, useContext, useEffect, useReducer, useState } from "react";
import type { Dispatch, ReactNode } from "react";
import { loadData, saveData, type AppData } from "../lib/storage";
import { reducer, type Action } from "./reducer";

const StoreContext = createContext<{ data: AppData; dispatch: Dispatch<Action> } | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, dispatch] = useReducer(reducer, undefined, loadData);
  const [saveFailed, setSaveFailed] = useState(false);
  useEffect(() => {
    setSaveFailed(!saveData(data));
  }, [data]);
  return (
    <StoreContext.Provider value={{ data, dispatch }}>
      {saveFailed && (
        <div className="banner-warn">
          ⚠️ Couldn't save — your phone's storage may be full. Recent changes could be lost.
        </div>
      )}
      {children}
    </StoreContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}
