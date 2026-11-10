package br.com.gabale.noscuidamos.teste;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
public class MainActivity extends BridgeActivity {
  @Override public void onCreate(Bundle state){registerPlugin(NativeToolsPlugin.class);super.onCreate(state);}
}
